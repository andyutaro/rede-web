import type { Metadata } from 'next'
import { createService } from '@/lib/supabase/service'
import { firstImageSrc, tokyoYmd } from '@/lib/site/text'
import { assignedOf, listAllImages } from '@/lib/site/photos'
import PhysicalGrid, { type PhysicalItem } from './PhysicalGrid'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Physical',
  description: 'Andyがつくったもの(OBJECT)と、開いた催しの記録(EVENT)。',
  alternates: { canonical: 'https://andyutaro.com/physical' },
}

// Physical棚(2026-07-12 / 2026-08-07にEvents棚を吸収)。
// 棚の定義は「物理作品のアーカイブ」から「物理世界にあるもの・あったこと」へ広げた。
// 薄い棚が2つ並ぶより、もの・ことが一つの棚にある方が構造が見える(Andy承認)。
// DBのtypeはphysical/eventのまま=棚名だけの変更(Article棚→Notesと同じ作法)。
export default async function PhysicalPage() {
  const service = createService()
  const [{ data: rows }, pool] = await Promise.all([
    service
      .from('articles')
      .select('*')
      .eq('status', 'published')
      .in('type', ['physical', 'event'])
      .order('published_at', { ascending: false }),
    listAllImages(),
  ])

  const items: PhysicalItem[] = (rows ?? [])
    .filter((a) => a.published_at && !a.deleted_at)
    .map((a) => {
      const first = firstImageSrc((a.html as string) ?? '')
      const thumb = (a.thumbnail_url as string | null) ?? first ?? assignedOf(pool, a.id as string)
      return {
        id: a.id as string,
        kind: a.type === 'event' ? 'event' : 'object',
        title: ((a.title as string) || '').trim() || '(無題)',
        date: tokyoYmd(a.published_at as string),
        thumb,
        assigned: !a.thumbnail_url && !first && Boolean(thumb),
      }
    })

  return (
    <div className="measure">
      <h1 className="sr-only">Physical</h1>
      <PhysicalGrid items={items} />
    </div>
  )
}
