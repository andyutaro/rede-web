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
  ep: 320, // エピソード一覧の小サムネ
  photo: 1280, // 本文写真・Homeのランダム写真(measure640の2倍)
  studio: 96, // studioの行内サムネ(34px)
  pick: 240, // studioのプール選択グリッド
} as const

export function imgThumb(url: string | null | undefined, width: number): string {
  if (!url) return ''
  // 既に変換済み/データURL/相対パスはそのまま(変換は絶対URLの元画像に対して行う)
  if (url.startsWith('data:') || url.includes('/cdn-cgi/image/')) return url
  if (!/^https?:\/\//i.test(url)) return url
  // AnchorのカバーURLはローテーションで失効することがある(旧URLは全経路403)。
  // その間は変換も404/502になるが、フィードキャッシュ(30分)の更新で自己回復する
  return `${CDN_BASE}/width=${width},quality=78,fit=scale-down,format=auto/${url}`
}
