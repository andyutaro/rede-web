import Link from 'next/link'
import { dateShort } from '@/lib/site/text'
import { imgThumb, IMG_W } from '@/lib/site/img'

// GUEST群(2026-09-10 Andy指定「Worksの下にGuest」)。
//
// ORIGINAL/WORKSはCoverGrid=**番組**のカバーが並ぶが、ここに並ぶのは
// **エピソード**のタイル。他人の番組を自分の番組と同じ顔で並べないための区別で、
// 下のエピソード一覧のGUESTタブと同じ中身・同じ組版(3段ラベル)になる。
//
// **件数は絞らない**(2026-09-16、当初の「最新4件」を撤回)。上のORIGINAL/WORKSは
// 番組を全部並べるので、ここだけ途中で切れていると棚が未完に見える。
// 並びは公開日降順(呼び出し側で並べ替え済み)。
export type GuestTile = {
  id: string
  showName: string
  title: string
  date: string
  image: string | null
}

export default function GuestGrid({ items }: { items: GuestTile[] }) {
  if (items.length === 0) return null

  return (
    <section className="section">
      <div className="section-head">
        <h2>GUEST</h2>
      </div>
      <div className="section-body grid4">
        {items.map((g) => (
          <div key={g.id}>
            <Link
              href={`/podcast/guest/${g.id}`}
              className="sq"
              aria-label={`${g.showName} ${g.title} ${dateShort(g.date)}`}
            >
              {g.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imgThumb(g.image, IMG_W.tile)}
                  alt=""
                  decoding="async"
                  className="cover-frame"
                />
              ) : (
                <span className="empty-cell" />
              )}
            </Link>
            <div className="ep-cell-label">
              <span className="ep-show">{g.showName}</span>
              <span className="ep-title">{g.title}</span>
              <span className="ep-date">{dateShort(g.date)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
