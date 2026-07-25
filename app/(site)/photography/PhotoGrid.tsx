'use client'

import { useState } from 'react'
import Link from 'next/link'
import { dateShort } from '@/lib/site/text'
import { imgThumb, IMG_W } from '@/lib/site/img'

export type PhotoItem = {
  id: string
  kind: 'artwork' | 'photolog'
  title: string
  date: string // YYYY-MM-DD
  thumb: string | null
  assigned?: boolean
}

// PHOTOLOGの写真セル(2026-07-25 Andy指定): 記事ではなく「アップした写真そのもの」。
// タイトルは持たず、追加された日の日付だけ。タップで掲載ページの当該写真へ
export type PhotologCell = { url: string; href: string; date: string }

// Photography一覧のタブ(NotesのALL/ARTICLE/SCRIBEと同型、2026-07-11)
const TABS = ['ALL', 'ARTWORK', 'PHOTOLOG'] as const
type Tab = (typeof TABS)[number]

// タブ横断で日付降順に並べるための内部表現
type Cell =
  | { c: 'article'; date: string; item: PhotoItem }
  | { c: 'photo'; date: string; item: PhotologCell }

export default function PhotoGrid({
  items,
  photolog,
}: {
  items: PhotoItem[]
  photolog: PhotologCell[]
}) {
  const [tab, setTab] = useState<Tab>('ALL')

  // PHOTOLOGタブ=写真の流れ(2026-07-25、photolog種の記事セルはALLにのみ出す)。
  // ARTWORKタブ=作品記事。ALL=両方を日付降順で混ぜる
  const cells: Cell[] = [
    ...items.map((i): Cell => ({ c: 'article', date: i.date, item: i })),
    ...photolog.map((p): Cell => ({ c: 'photo', date: p.date, item: p })),
  ]
    .filter((cell) =>
      tab === 'ALL'
        ? true
        : tab === 'PHOTOLOG'
          ? cell.c === 'photo'
          : cell.c === 'article' && cell.item.kind === 'artwork'
    )
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

  return (
    <section className="section">
      <div className="section-head article-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'active' : ''}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="section-body grid4">
        {cells.map((cell) =>
          cell.c === 'article' ? (
            <div key={cell.item.id}>
              {/* サムネイルはalt=""(装飾)でタイトルは兄弟divにあるため、リンク名が
                  空でURL(UUID)が読み上げられていた(2026-07-23)。可視ラベルと同じ文言を与える */}
              <Link
                href={`/photography/${cell.item.id}`}
                className="sq"
                aria-label={`${cell.item.kind.toUpperCase()} ${cell.item.title} ${dateShort(cell.item.date)}`}
              >
                {cell.item.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imgThumb(cell.item.thumb, IMG_W.tile)}
                    alt=""
                    loading="lazy"
                    className={cell.item.assigned ? 'thumb-assigned' : undefined}
                  />
                ) : (
                  <span className="empty-cell" />
                )}
              </Link>
              <div className="ep-cell-label">
                <span className="ep-show">{cell.item.kind.toUpperCase()}</span>
                <span className="ep-title">{cell.item.title}</span>
                <span className="ep-date">{dateShort(cell.item.date)}</span>
              </div>
            </div>
          ) : (
            <div key={cell.item.url}>
              <Link
                href={cell.item.href}
                className="sq"
                aria-label={`PHOTOLOG ${dateShort(cell.item.date)}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgThumb(cell.item.url, IMG_W.tile)} alt="" loading="lazy" />
              </Link>
              {/* 写真セルはタイトルなし(Andy指定)。種別と日付の2段 */}
              <div className="ep-cell-label">
                <span className="ep-show">PHOTOLOG</span>
                <span className="ep-date">{dateShort(cell.item.date)}</span>
              </div>
            </div>
          )
        )}
      </div>
      {cells.length === 0 && <p className="shelf-empty">まだ作品がありません</p>}
    </section>
  )
}
