import Link from 'next/link'
import { samePeriod } from '@/lib/site/samePeriod'
import { dateShort } from '@/lib/site/text'
import { imgThumb, IMG_W } from '@/lib/site/img'

// 「同じ頃の作品」の窓(2026-07-28 Andy指定): その日付の前後7日に生まれた他の仕事。
// 日付を鍵にサイト全体を結ぶ。中身が無い日はブロックごと出さない(空の器を置かない)。
//
// 表示はPhotography一覧と同じ画像グリッド(2026-07-28 Andy指定)。
// 正方形タイル+3段ラベル(種別/タイトル/日付)の文法は棚と完全共通=
// 新しい見た目を増やさない。タイトルは2行で切れる(既存の.ep-titleの作法)。
export default async function SamePeriod({
  date,
  excludePrefix,
}: {
  date: string
  excludePrefix: string
}) {
  const items = await samePeriod(date, excludePrefix)
  if (items.length === 0) return null
  return (
    <section className="section same-period">
      <div className="section-head">
        <h2>同じ頃の作品</h2>
      </div>
      <div className="section-body grid4">
        {items.map((item) => (
          <div key={item.href}>
            {/* サムネイルは装飾(alt="")でタイトルは兄弟div。リンク名を明示する
                (2026-07-23に他の棚で踏んだ、URLが読み上げられる問題の作法) */}
            <Link
              href={item.href}
              className="sq"
              aria-label={`${item.label} ${item.title} ${dateShort(item.date)}`}
            >
              {item.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={imgThumb(item.thumb, IMG_W.tile)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className={item.assigned ? 'thumb-assigned' : undefined}
                />
              ) : (
                <span className="empty-cell" />
              )}
            </Link>
            <div className="ep-cell-label">
              <span className="ep-show">{item.label}</span>
              <span className="ep-title">{item.title}</span>
              <span className="ep-date">{dateShort(item.date)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
