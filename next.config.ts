import type { NextConfig } from "next";

// セキュリティヘッダー(2026-07-14)。CSPはdev/prod両方で有効化して壊れを早期に検知する。
// devのみHMR用に'unsafe-eval'とlocalhostのws/httpを足す。
const isDev = process.env.NODE_ENV !== "production";

// CSPのconnect-src: Supabase(REST/Realtime)とscribe中継の実オリジンを許可する。
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const origin = (raw: string, wsOnly = false): string => {
  try {
    const u = new URL(raw);
    const ws = u.protocol === "https:" ? "wss" : "ws";
    return wsOnly ? `${ws}://${u.host}` : `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
};
// scribe中継のオリジン。next.config.tsはビルド時に実行されるため、envを持たない
// ビルド環境(Workers Builds等)でもCSPのconnect-srcから中継が欠けないよう、
// 公開オリジン(全レスポンスのCSPヘッダに載る値=秘密ではない)を既定値に持つ。
// 2026-07-25の初回CIビルドで欠落しライブ配信が全停止した事故の恒久対策。
const relayUrl = process.env.SCRIBE_RELAY_URL ?? "wss://rede-relay.onrender.com";

// Supabaseの公開オリジン。中継と同じ理由で既定値を持つ(2026-07-30):
// ビルド環境にenvが無いとCSPからSupabaseが欠け、REST・画像が全部ブロックされる。
// この値は全レスポンスのCSPヘッダとクライアントJSに載る公開値=秘密ではない。
const SUPABASE_ORIGIN =
  (supabaseUrl && origin(supabaseUrl)) || "https://amrjiefatrafawhygrvm.supabase.co";

// 公開サイトのオリジン。lib/site/img.tsのCDN_BASEと必ず同じ値にする
// (画像の変換URLがこのドメイン固定で作られるため)
const SITE_ORIGIN = "https://andyutaro.com";

const connectSrc = [
  "'self'",
  SUPABASE_ORIGIN, // https://xxx.supabase.co (REST/Auth)
  SUPABASE_ORIGIN.replace(/^https:/, "wss:"), // wss://xxx.supabase.co (Realtime)
  relayUrl && origin(relayUrl), // scribe中継(https)
  relayUrl && origin(relayUrl, true), // scribe中継(wss=/ws/sub)
  "https://cloudflareinsights.com", // Web Analyticsビーコン送信先(2026-07-21)
  isDev && "ws://localhost:*",
  isDev && "http://localhost:*",
]
  .filter(Boolean)
  .join(" ");

const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  "https://static.cloudflareinsights.com", // Web Analyticsビーコン(2026-07-21)
  isDev && "'unsafe-eval'",
]
  .filter(Boolean)
  .join(" ");

// 埋め込みは既存のホワイトリスト(lib/scribe/liveClient.ts)と一致させる
const frameSrc = [
  "https://open.spotify.com",
  "https://embed.podcasts.apple.com",
  "https://www.youtube.com",
  "https://www.youtube-nocookie.com",
].join(" ");

const csp = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'", // next/font・インラインstyle属性
  // img/mediaの`https:`(=どこへでも)を実際に使うホストだけに絞る(2026-07-30 点検)。
  // script-srcの'unsafe-inline'はNextのnonce方式が全ページの動的レンダリングを
  // 要求する(=ISRを捨ててCPUが増える。1102の再来)ため今回は外せない。
  // そこで「万一スクリプトが注入されても外へ持ち出せない」側を締める:
  // 画像は自ドメイン(cdn-cgiの変換込み)とSupabase Storageだけ。
  // 本文写真・番組アートはすべて /cdn-cgi/image/ 経由=自ドメイン扱いなので足りる
  // (実測: 全ページのimg srcは自ドメインとsupabase.coの2種のみ)。
  // 本番オリジンを明示するのが必須(2026-07-30 検証で全画像が壊れた)。
  // lib/site/img.tsのimgThumbは変換URLを`https://andyutaro.com/cdn-cgi/image/...`と
  // **ドメイン固定の絶対URL**で作る(dev/併走環境でも変換済み画像を引くための設計)。
  // 本番では'self'と同じだが、devではオリジンが違うので'self'に当たらない。
  `img-src 'self' data: blob: ${SITE_ORIGIN} ${SUPABASE_ORIGIN}`,
  // 音源はAnchorのenclosure(実体はcloudfrontへリダイレクト)。動画は自ドメイン
  "media-src 'self' blob: https://anchor.fm https://d3ctxlq1ktw2nl.cloudfront.net",
  "font-src 'self' data:",
  `frame-src ${frameSrc}`,
  `connect-src ${connectSrc}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'", // クリックジャッキング防止(サイト全体を他所に埋め込ませない)
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" }, // frame-ancestors非対応の旧環境向け保険
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      // wwwは正規のapexへ(2026-07-14、andyutaro.com紐付け)
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.andyutaro.com" }],
        destination: "https://andyutaro.com/:path*",
        permanent: true,
      },
      // Article棚はNotesへ改名(2026-07-10)。旧URLを永続リダイレクトで受ける
      { source: "/article", destination: "/notes", permanent: true },
      { source: "/article/:id", destination: "/notes/:id", permanent: true },
      // 旧サイト(STUDIO)の/profileの後継は/about(PROFILE節を含む)。
      // Googleが旧URLを覚えていて404を報告していた(2026-07-27 Search Console)
      { source: "/profile", destination: "/about", permanent: true },
    ];
  },
};

export default nextConfig;
