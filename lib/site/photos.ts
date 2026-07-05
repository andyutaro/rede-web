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

// 充当サムネイル(handoff-notes §11): プールから決定的に1枚選ぶ。
// DBのthumbnail_url列が使えるようになるまでの間も「一度決まったら固定」に
// 近づけるため、キー(日付やID)のハッシュで選ぶ(プールが増えない限り不変)。
export function assignedOf(urls: string[], key: string): string | null {
  if (urls.length === 0) return null
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return urls[h % urls.length]
}
