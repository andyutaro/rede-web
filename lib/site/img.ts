// 画像の表示用縮小URL(2026-07-19)。Cloudflare Image Transformationsで
// エッジ変換(リサイズ+AVIF/WebP+エッジキャッシュ)する。
// 背景: カバー等がCDN原寸(3000px級、1〜3MB)のまま数百px枠に流れ込み、
// トップだけで約5.6MBという「もっさり」の主因だった。
// 無料枠は5,000ユニーク変換/月(ユニーク=元URL×パラメータ組)。うちは数百程度。
// ドメイン固定の絶対URLにするのは、Vercel併走やlocalhost devでも
// 変換済み画像が引けるようにするため(変換はandyutaro.comゾーンで行われる)。
const CDN_BASE = 'https://andyutaro.com/cdn-cgi/image'

// 用途別の幅(表示幅×2=Retina想定)
export const IMG_W = {
  tile: 480, // 棚のタイル(カバー・サムネ、表示138〜220px)
  og: 1200, // SNSカード(OGP)。正方形アートをそのまま出す

  ep: 320, // エピソード一覧の小サムネ
  product: 640, // 番組ページの派生プロダクト(2列グリッド、表示約306px)
  photo: 1280, // 本文写真・Homeのランダム写真(measure640の2倍)
  studio: 96, // studioの行内サムネ(34px)
  pick: 240, // studioのプール選択グリッド
} as const

// SNSカード用の1200×630(2026-07-29)。番組カバーは正方形なので、
// summary_large_imageにそのまま載せると上下が切られる(だからカード種別を
// summaryに落としていた)。切らずに大きく出すため、紙色(--bg)で左右に余白を
// 敷いて16:9強に仕立てる=額装。format=jpegはスクレイパー確実性のため
// (format=autoはAccept次第でAVIFを返し、対応しない収集器がある)。
const CARD_BG = 'f4f3ee' // globals.cssの--bg(紙色)
export function imgCard(url: string | null | undefined): string {
  if (!url || !/^https?:\/\//i.test(url) || url.includes('/cdn-cgi/image/')) return url ?? ''
  return `${CDN_BASE}/width=1200,height=630,fit=pad,background=%23${CARD_BG},quality=82,format=jpeg/${url}`
}

// 枠に合わせて切り取った画像(2026-08-27)。Homeの写真1枚のように、
// 表示側でobject-fit:coverするスロット用。CSSだけで切ると、縦長の元画像を
// まるごと落としてから大半を捨てることになる(1280幅の縦写真は1280×1700級)。
// CDN側で切っておけば転送も復号も枠のぶんで済む。
// 変換の組み合わせが1つ増えるので無料枠(5,000ユニーク/月)を少し使うが、
// 現状は数百なので余る。
export function imgCover(
  url: string | null | undefined,
  width: number,
  height: number
): string {
  if (!url) return ''
  if (url.startsWith('data:') || url.includes('/cdn-cgi/image/')) return url
  if (!/^https?:\/\//i.test(url)) return url
  return `${CDN_BASE}/width=${width},height=${height},quality=78,fit=cover,format=auto/${url}`
}

export function imgThumb(url: string | null | undefined, width: number): string {
  if (!url) return ''
  // 既に変換済み/データURL/相対パスはそのまま(変換は絶対URLの元画像に対して行う)
  if (url.startsWith('data:') || url.includes('/cdn-cgi/image/')) return url
  if (!/^https?:\/\//i.test(url)) return url
  // AnchorのカバーURLはローテーションで失効することがある(旧URLは全経路403)。
  // その間は変換も404/502になるが、フィードキャッシュ(30分)の更新で自己回復する
  return `${CDN_BASE}/width=${width},quality=78,fit=scale-down,format=auto/${url}`
}
