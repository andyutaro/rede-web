import type { Metadata } from 'next'
import Link from 'next/link'
import { createService } from '@/lib/supabase/service'
import { firstImageSrc, dateShort, tokyoYmd } from '@/lib/site/text'
import { assignedOf, listAllImages } from '@/lib/site/photos'
import { imgThumb, IMG_W } from '@/lib/site/img'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Events',
  description: 'Andyがこれまでに開いた催しの記録。',
  alternates: { canonical: 'https://andyutaro.com/events' },
}

// EVENTS棚(2026-07-29 Andy指定): これまでに開いた催しの記録。
// データはarticlesのtype=event。並びは開催日(published_at)の新しい順。
// レイアウトはNotes/Photography/Physicalと共通のグリッド+3段ラベル。
export default async function EventsPage() {
  const service = createService()
  const [{ data: rows }, pool] = await Promise.all([
    service
      .from('articles')
      .select('*')
      .eq('status', 'published')
      .eq('type', 'event')
      .order('published_at', { ascending: false }),
    listAllImages(),
  ])

  const items = (rows ?? [])
    .filter((a) => a.published_at && !a.deleted_at)
    .map((a) => {
      const first = firstImageSrc((a.html as string) ?? '')
      const thumb = (a.thumbnail_url as string | null) ?? first ?? assignedOf(pool, a.id as string)
      return {
        id: a.id as string,
        title: ((a.title as string) || '').trim() || '(無題)',
        date: tokyoYmd(a.published_at as string),
        thumb,
        assigned: !a.thumbnail_url && !first && Boolean(thumb),
      }
    })

  return (
    <div className="measure">
      <section className="section">
        <div className="section-head">
          <h1>EVENTS — {items.length}</h1>
        </div>
        <div className="section-body grid4">
          {items.map((item) => (
            <div key={item.id}>
              {/* サムネイルは装飾でタイトルは兄弟div。リンク名を与える(2026-07-23) */}
              <Link
                href={`/events/${item.id}`}
                className="sq"
                aria-label={`EVENTS ${item.title} ${dateShort(item.date)}`}
              >
                {item.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imgThumb(item.thumb, IMG_W.tile)}
                    alt=""
                    loading="lazy"
                    className={item.assigned ? 'thumb-assigned' : undefined}
                  />
                ) : (
                  <span className="empty-cell" />
                )}
              </Link>
              <div className="ep-cell-label">
                <span className="ep-show">EVENTS</span>
                <span className="ep-title">{item.title}</span>
                <span className="ep-date">{dateShort(item.date)}</span>
              </div>
            </div>
          ))}
        </div>
        {items.length === 0 && <p className="shelf-empty">まだ催しがありません</p>}
      </section>
    </div>
  )
}
