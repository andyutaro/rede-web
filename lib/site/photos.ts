import { createService } from '@/lib/supabase/service'

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
// article→/notes、それ以外はtype名がそのまま棚(/photography /physical …)。
export function shelfPathForType(type: string): string {
  return type === 'article' ? '/notes' : `/${type}`
}

// 本文HTMLから、scribe-mediaの画像URLを列挙する(<img src>のみ。動画・PDFは除く)。
function imageUrlsInHtml(html: string): string[] {
  const urls: string[] = []
  for (const m of (html || '').matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    if (/scribe-media/.test(m[1]) && IMG_RE.test(m[1])) urls.push(m[1])
  }
  return urls
}

// 候補プール(掲載画像→掲載ページの対応表)は30分キャッシュ。全記事+全scribeの
// 本文HTMLをDBから毎リクエスト転送して正規表現走査するのはコンテンツ量に比例して
// 重くなるため。ランダム抽選自体は毎リクエスト行う(訪問ごとに違う写真=挙動維持)。
let photoPoolCache: { promise: Promise<{ url: string; href: string }[]>; ts: number } | null = null

function photoPool(): Promise<{ url: string; href: string }[]> {
  if (photoPoolCache && Date.now() - photoPoolCache.ts < POOL_TTL_MS) return photoPoolCache.promise
  const promise = loadPhotoPool()
  photoPoolCache = { promise, ts: Date.now() }
  return promise
}

async function loadPhotoPool(): Promise<{ url: string; href: string }[]> {
  const service = createService()
  // 走査に必要な列だけ読む(htmlが本体。他の列は転送しない)
  const [{ data: arts }, { data: days }] = await Promise.all([
    service.from('articles').select('id, type, html, deleted_at').eq('status', 'published'),
    service.from('scribe_days').select('date, html, deleted_at').not('finalized_at', 'is', null),
  ])

  const candidates: { url: string; href: string }[] = []
  const seen = new Set<string>()
  const add = (html: string, href: string) => {
    for (const url of imageUrlsInHtml(html)) {
      if (seen.has(url)) continue
      seen.add(url)
      candidates.push({ url, href })
    }
  }

  const liveArts = (arts ?? []).filter((a) => !a.deleted_at)
  // 作品棚(photography/physical/将来のtype)を先に、Notes(article)を後に、scribeを最後に
  for (const a of liveArts.filter((a) => a.type !== 'article')) {
    add(a.html as string, `${shelfPathForType(a.type as string)}/${a.id}`)
  }
  for (const a of liveArts.filter((a) => a.type === 'article')) {
    add(a.html as string, `${shelfPathForType(a.type as string)}/${a.id}`)
  }
  for (const d of (days ?? []).filter((d) => !d.deleted_at)) {
    add(d.html as string, `/scribe/${d.date}`)
  }
  return candidates
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
