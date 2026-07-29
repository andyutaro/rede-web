import { createService } from '@/lib/supabase/service'
import { cachedJson } from '@/lib/site/edgeCache'

const BUCKET = 'scribe-media'
const IMG_RE = /\.(jpe?g|png|gif|webp|avif)$/i

// インスタンス内TTLキャッシュ(podcastFeedと同方式)。Storage走査は
// 「ルート1回+日付フォルダ数」のAPI呼び出しになり日数に比例して重くなるため、
// 毎リクエスト実行しない。Promiseを入れて同時リクエストの重複走査も防ぐ。
const POOL_TTL_MS = 30 * 60 * 1000
let imagesCache: { promise: Promise<string[]>; ts: number } | null = null

// サイト内全アップロード写真(scribe-mediaバケット)の一覧を返す(30分キャッシュ)。
// パス構造は「YYYY-MM-DD/uuid.ext」(フォルダ=日付)。
// サムネイル充当プールとHomeのランダム1枚の両方がこれを使う。
// 充当は「一度決まったら固定」が原則なので、プールの反映遅れ(最大30分)は無害。
export function listAllImages(): Promise<string[]> {
  if (imagesCache && Date.now() - imagesCache.ts < POOL_TTL_MS) return imagesCache.promise
  const promise = loadAllImages()
  imagesCache = { promise, ts: Date.now() }
  return promise
}

async function loadAllImages(): Promise<string[]> {
  const service = createService()
  const { data: entries, error } = await service.storage.from(BUCKET).list('', { limit: 1000 })
  if (error || !entries) return []

  const urls: string[] = []
  const folders = entries.filter((e) => e.id === null) // idなし=フォルダ
  // ルート直下にファイルが直置きされている場合も拾う
  for (const e of entries) {
    if (e.id !== null && IMG_RE.test(e.name)) urls.push(publicUrl(e.name))
  }
  const results = await Promise.all(
    folders.map((f) => service.storage.from(BUCKET).list(f.name, { limit: 1000 }))
  )
  results.forEach((r, i) => {
    for (const file of r.data ?? []) {
      if (IMG_RE.test(file.name)) urls.push(publicUrl(`${folders[i].name}/${file.name}`))
    }
  })
  return urls.sort() // 順序を安定させる(決定的な充当のため)
}

function publicUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`
}

// 記事typeから公開棚のパスを導く「唯一の対応表」。
// 新しいtype(棚)を足すときはここだけ直せばHomeのリンクも自動で追従する。
// article→/notes、event→/events(棚だけ複数形)、
// それ以外はtype名がそのまま棚(/photography /physical …)。
export function shelfPathForType(type: string): string {
  if (type === 'article') return '/notes'
  if (type === 'event') return '/events'
  return `/${type}`
}

// 本文HTMLから、scribe-mediaの画像URLを列挙する(<img src>のみ。動画・PDFは除く)。
function imageUrlsInHtml(html: string): string[] {
  const urls: string[] = []
  for (const m of (html || '').matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    if (/scribe-media/.test(m[1]) && IMG_RE.test(m[1])) urls.push(m[1])
  }
  return urls
}

// 候補プール(掲載画像→掲載ページの対応表)はキャッシュする。全記事+全scribeの
// 本文HTMLをDBから毎リクエスト転送して正規表現走査するのはコンテンツ量に比例して
// 重くなるため(トップページはforce-dynamicなので毎リクエストこれを踏み、コールドな
// isolateではメモリキャッシュも効かず、Error 1102の主因になっていた。2026-07-24)。
// エッジキャッシュ(拠点毎)を第一段、メモリキャッシュを第二段に重ねる。
// ランダム抽選自体は毎リクエスト行う(訪問ごとに違う写真=挙動維持)。
//
// エントリはPHOTOLOG(2026-07-25)も使うため、掲載元の区分と日付を持つ:
// - kind: 'artwork'(photography/artwork) | 'photography' | 'physical' | 'article' | 'scribe'
// - date: 写真が追加された日(パスのYYYY-MM-DDフォルダ=アップロード日。
//         旧ルート直置きファイルだけ掲載ページの日付で代用)
type PoolEntry = { url: string; href: string; kind: string; date: string }

let photoPoolCache: { promise: Promise<PoolEntry[]>; ts: number } | null = null

function photoPool(): Promise<PoolEntry[]> {
  if (photoPoolCache && Date.now() - photoPoolCache.ts < POOL_TTL_MS) return photoPoolCache.promise
  const promise = cachedJson('photo-pool-2', POOL_TTL_MS / 1000, loadPhotoPool)
  photoPoolCache = { promise, ts: Date.now() }
  return promise
}

// アップロード日: scribe-mediaのパス構造「YYYY-MM-DD/uuid.ext」から取る
function uploadDateOf(url: string): string | null {
  const m = url.match(/scribe-media\/(\d{4}-\d{2}-\d{2})\//)
  return m ? m[1] : null
}

async function loadPhotoPool(): Promise<PoolEntry[]> {
  const service = createService()
  // 走査に必要な列だけ読む(htmlが本体。他の列は転送しない)
  const [{ data: arts }, { data: days }] = await Promise.all([
    service
      .from('articles')
      .select('id, type, photo_kind, published_at, html, deleted_at')
      .eq('status', 'published'),
    service.from('scribe_days').select('date, html, deleted_at').not('finalized_at', 'is', null),
  ])

  const candidates: PoolEntry[] = []
  const seen = new Set<string>()
  const add = (html: string, href: string, kind: string, pageDate: string) => {
    for (const url of imageUrlsInHtml(html)) {
      if (seen.has(url)) continue
      seen.add(url)
      candidates.push({ url, href, kind, date: uploadDateOf(url) ?? pageDate })
    }
  }
  const ymd = (ts: string | null) => (ts ? String(ts).slice(0, 10) : '')

  const liveArts = (arts ?? []).filter((a) => !a.deleted_at)
  // 作品棚(photography/physical/将来のtype)を先に、Notes(article)を後に、scribeを最後に
  for (const a of liveArts.filter((a) => a.type !== 'article')) {
    const kind =
      a.type === 'photography' && (a.photo_kind ?? 'photolog') === 'artwork'
        ? 'artwork'
        : (a.type as string)
    add(a.html as string, `${shelfPathForType(a.type as string)}/${a.id}`, kind, ymd(a.published_at))
  }
  for (const a of liveArts.filter((a) => a.type === 'article')) {
    add(
      a.html as string,
      `${shelfPathForType(a.type as string)}/${a.id}`,
      'article',
      ymd(a.published_at)
    )
  }
  for (const d of (days ?? []).filter((d) => !d.deleted_at)) {
    add(d.html as string, `/scribe/${d.date}`, 'scribe', d.date as string)
  }
  return candidates
}

// PHOTOLOG(2026-07-25 Andy指定): 「scribeに写真を上げていることこそフォトログ」。
// 公開中コンテンツの本文に載っている全アップロード写真(サムネイルの1枚に限らない)を
// 新しい順に流す。タップ先は掲載ページの当該写真(#p=ファイル名、ScribeArchiveが
// スクロール)。除外: photography/artworkに載る写真(作品はARTWORKの領分)。
// ポッドキャストのカバー・エピソード画像はRSSの外部URLなので最初から母集団外。
// 当日の未確定scribeも母集団外(アーカイブは確定テキストの原則)。
export type PhotologPhoto = { url: string; href: string; date: string }

export async function photologPhotos(): Promise<PhotologPhoto[]> {
  const entries = await photoPool()
  return entries
    .filter((e) => e.kind !== 'artwork')
    .map((e) => ({
      url: e.url,
      href: `${e.href}#p=${encodeURIComponent(e.url.split('/').pop() ?? '')}`,
      date: e.date,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.url < b.url ? -1 : 1))
}

// Homeのランダム写真: 「公開中コンテンツの本文に実際に載っている画像」だけから選ぶ。
// こうすると選ばれた写真は必ずその掲載ページへリンクでき、tapして飛べない事故が
// 起きない(下書き・孤児画像は母集団に入らない)。優先度: 作品棚(article以外) >
// Notes > scribe。同じ画像が複数ページにある場合は先勝ち。
// type→パスはshelfPathForType一本に集約=新しい棚を足しても自動で正しく張られる。
export async function randomPhotoWithHref(): Promise<{ url: string; href: string } | null> {
  const candidates = await photoPool()
  if (candidates.length === 0) return null
  return candidates[Math.floor(Math.random() * candidates.length)]
}

// 充当サムネイル(handoff-notes §11): プールから決定的に1枚選ぶ。
// DBのthumbnail_url列が使えるようになるまでの間も「一度決まったら固定」に
// 近づけるため、キー(日付やID)のハッシュで選ぶ(プールが増えない限り不変)。
export function assignedOf(urls: string[], key: string): string | null {
  if (urls.length === 0) return null
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return urls[h % urls.length]
}
