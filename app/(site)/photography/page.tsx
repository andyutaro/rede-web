import type { Metadata } from 'next'
import Link from 'next/link'
import { createService } from '@/lib/supabase/service'
import { firstImageSrc, dateShort } from '@/lib/site/text'
import { assignedOf, listAllImages } from '@/lib/site/photos'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Photography' }

// Photography棚(2026-07-10にNotesから独立・格上げ)。
// データはarticlesのtype=photography(エディタ・保存はNotesと共通のまま)。
// セルはNotes/Podcastと同じ3段ラベル(種別/タイトル/日付)。
export default async function PhotographyPage() {
  const service = createService()
  const [{ data: rows }, pool] = await Promise.all([
    service
      .from('articles')
      .select('id, title, html, thumbnail_url, published_at')
      .eq('status', 'published')
      .eq('type', 'photography')
      .order('published_at', { ascending: false }),
    listAllImages(),
  ])

  const items = (rows ?? [])
    .filter((a) => a.published_at)
    .map((a) => {
      const first = firstImageSrc((a.html as string) ?? '')
      const thumb = (a.thumbnail_url as string | null) ?? first ?? assignedOf(pool, a.id as string)
      return {
        id: a.id as string,
        title: ((a.title as string) || '').trim() || '(無題)',
        date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(
          new Date(a.published_at as string)
        ),
        thumb,
        assigned: !a.thumbnail_url && !first && Boolean(thumb),
      }
    })

  return (
    <div className="measure">
      <section className="section">
        <div className="section-head">
          <span>PHOTOGRAPHY — {items.length}</span>
        </div>
        <div className="section-body grid4">
          {items.map((item) => (
            <div key={item.id}>
              <Link href={`/photography/${item.id}`} className="sq">
                {item.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.thumb}
                    alt=""
                    loading="lazy"
                    className={item.assigned ? 'thumb-assigned' : undefined}
                  />
                ) : (
                  <span className="empty-cell" />
                )}
              </Link>
              <div className="ep-cell-label">
                <span className="ep-show">PHOTOGRAPHY</span>
                <span className="ep-title">{item.title}</span>
                <span className="ep-date">{dateShort(item.date)}</span>
              </div>
            </div>
          ))}
        </div>
        {items.length === 0 && <p className="shelf-empty">まだ作品がありません</p>}
      </section>
    </div>
  )
}
