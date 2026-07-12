import { createService } from '@/lib/supabase/service'

const BUCKET = 'scribe-media'
const IMG_RE = /\.(jpe?g|png|gif|webp|avif)$/i

// サイト内全アップロード写真(scribe-mediaバケット)の一覧を返す。
// パス構造は「YYYY-MM-DD/uuid.ext」(フォルダ=日付)。
// サムネイル充当プールとHomeのランダム1枚の両方がこれを使う。
export async function listAllImages(): Promise<string[]> {
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

export function randomOf(urls: string[]): string | null {
  if (urls.length === 0) return null
  return urls[Math.floor(Math.random() * urls.length)]
}

// Homeのランダム写真: 画像を1枚選び、それが載っているページへのリンクを解決する。
// 優先順位: Photography > Physical > Notes > scribe(公開中のものだけ)。
// どこにも載っていない画像(直後にGCされる類)はリンクなし。
export async function randomPhotoWithHref(): Promise<{ url: string; href: string | null } | null> {
  const urls = await listAllImages()
  const url = randomOf(urls)
  if (!url) return null

  const service = createService()
  // '*': deleted_at等の後発列がマイグレーション未実行でも壊れない
  const [{ data: arts }, { data: days }] = await Promise.all([
    service.from('articles').select('*').eq('status', 'published'),
    service.from('scribe_days').select('*').not('finalized_at', 'is', null),
  ])

  const liveArts = (arts ?? []).filter((a) => !a.deleted_at && (a.html as string)?.includes(url))
  const photo = liveArts.find((a) => a.type === 'photography')
  if (photo) return { url, href: `/photography/${photo.id}` }
  const physical = liveArts.find((a) => a.type === 'physical')
  if (physical) return { url, href: `/physical/${physical.id}` }
  if (liveArts[0]) return { url, href: `/notes/${liveArts[0].id}` }

  const day = (days ?? []).find((d) => !d.deleted_at && (d.html as string)?.includes(url))
  if (day) return { url, href: `/scribe/${day.date}` }
  return { url, href: null }
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
