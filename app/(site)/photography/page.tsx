import type { Metadata } from 'next'
import { createService } from '@/lib/supabase/service'
import { firstImageSrc, tokyoYmd } from '@/lib/site/text'
import { assignedOf, listAllImages } from '@/lib/site/photos'
import PhotoGrid, { type PhotoItem } from './PhotoGrid'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Photography' }

// Photography棚(2026-07-10独立)。下位区分artwork/photologのタブ(2026-07-11)。
// データはarticlesのtype=photography。セルは3段ラベル(区分/タイトル/日付)。
export default async function PhotographyPage() {
  const service = createService()
  const [{ data: rows }, pool] = await Promise.all([
    // '*': photo_kind/description列のマイグレーション未実行でも壊れない
    service
      .from('articles')
      .select('*')
      .eq('status', 'published')
      .eq('type', 'photography')
      .order('published_at', { ascending: false }),
    listAllImages(),
  ])

  const items: PhotoItem[] = (rows ?? [])
    .filter((a) => a.published_at && !a.deleted_at)
    .map((a) => {
      const first = firstImageSrc((a.html as string) ?? '')
      const thumb = (a.thumbnail_url as string | null) ?? first ?? assignedOf(pool, a.id as string)
      return {
        id: a.id as string,
        kind: (a.photo_kind as 'artwork' | 'photolog' | null) ?? 'photolog',
        title: ((a.title as string) || '').trim() || '(無題)',
        date: tokyoYmd(a.published_at as string),
        thumb,
        assigned: !a.thumbnail_url && !first && Boolean(thumb),
      }
    })

  return (
    <div className="measure">
      <PhotoGrid items={items} />
    </div>
  )
}
