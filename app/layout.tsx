import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SITE_DESCRIPTION } from "@/lib/site/about";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// OGP画像のalt(SNSカード用)
const OG_ALT = "Andy — Podcaster。闇に発光するツノホコリと音の波形";

export const metadata: Metadata = {
  metadataBase: new URL("https://andyutaro.com"),
  title: "Andy 〔 Podcaster 〕",
  // description不在だとGoogleが本文から適当に抜く(ページャー矢印まで出た、
  // 2026-07-25)。文言はAndyの署名+Aboutリードからの組成(lib/site/about.ts)
  description: SITE_DESCRIPTION,
  // OGP画像は絶対URLで明示する(2026-07-14)。この改変版Nextはファイル規約
  // (opengraph-image.jpg)のURL解決がmetadataBaseを拾わず、実行環境の
  // フォールバック(worker=localhost, Vercel=配備URL)になるため、
  // 「絶対URLはmetadataBaseを無視してそのまま使う」仕様で確実に固定する
  openGraph: {
    images: [{ url: "https://andyutaro.com/og.jpg", width: 1200, height: 630, alt: OG_ALT }],
  },
  twitter: {
    card: "summary_large_image",
    images: [{ url: "https://andyutaro.com/og.jpg", alt: OG_ALT }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: data-themeはペイント前のインラインスクリプトが
    // 付与する(公開サイトのダークモード)ため、サーバーHTMLとの属性差分は意図的
    // lang="ja": 中身は全て日本語なのにenのままだった(2026-07-23)。
    // 支援技術が日本語を英語の音声で読み上げてしまう=読み上げが実質成立しない
    <html
      lang="ja"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
