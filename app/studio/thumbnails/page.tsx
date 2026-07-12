import { createClient } from '@/lib/supabase/server'
import { firstImageSrc, scribeTitle } from '@/lib/site/text'
import { assignedOf, listAllImages } from '@/lib/site/photos'
import ThumbGrid, { type ThumbItem } from './ThumbGrid'

export const dynamic = 'force-dynamic'

// THUMBNAILS室: サムネイル3状態(manual/first_image/assigned)の確認と手動差し替え。
// 手動はプール(scribe-media全画像)から選ぶ。自動に戻すと焼き込みを消して
// 次の表示時に「本文の最初の画像→充当」で再決定される。
export default async function StudioThumbnails() {
  const supabase = await createClient()
  const [{ data: days }, { data: articles }, pool] = await Promise.all([
    supabase
      .from('scribe_days')
      .select('date, html, thumbnail_url, thumbnail_source, deleted_at, finalized_at')
      .not('finalized_at', 'is', null)
      .is('deleted_at', null)
      .order('date', { ascending: false }),
    supabase
      .from('articles')
      .select('id, title, type, html, thumbnail_url, thumbnail_source, deleted_at, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    listAllImages(),
  ])

  const items: ThumbItem[] = []

  for (const a of articles ?? []) {
    const first = firstImageSrc((a.html as string) ?? '')
    const source = (a.thumbnail_source as string | null) ?? (first ? 'first_image' : 'assigned')
    const thumb =
      a.thumbnail_source === 'manual'
        ? (a.thumbnail_url as string)
        : first ?? (a.thumbnail_url as string | null) ?? assignedOf(pool, a.id as string)
    items.push({
      target: 'article',
      id: a.id as string,
      title: `${(a.type as string) === 'article' ? 'ARTICLE' : (a.type as string).toUpperCase()} — ${((a.title as string) || '').trim() || '(無題)'}`,
      thumb,
      source,
    })
  }

  for (const d of days ?? []) {
    const first = firstImageSrc((d.html as string) ?? '')
    const source = (d.thumbnail_source as string | null) ?? (first ? 'first_image' : 'assigned')
    const thumb =
      d.thumbnail_source === 'manual'
        ? (d.thumbnail_url as string)
        : first ?? (d.thumbnail_url as string | null) ?? assignedOf(pool, d.date as string)
    items.push({
      target: 'scribe',
      id: d.date as string,
      title: `SCRIBE — ${scribeTitle(d.date as string)}`,
      thumb,
      source,
    })
  }

  return (
    <>
      <h1 className="studio-h1">THUMBNAILS</h1>
      <ThumbGrid items={items} pool={pool} />
    </>
  )
}
