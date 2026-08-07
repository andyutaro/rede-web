'use client'

import { useState } from 'react'
import Link from 'next/link'
import { dateShort } from '@/lib/site/text'
import { imgThumb, IMG_W } from '@/lib/site/img'

// Physical棚のセル。kindは棚の下位区分(Photographyのartwork/photologと同型)
export type PhysicalItem = {
  id: string
  kind: 'object' | 'event'
  title: string
  date: string // YYYY-MM-DD
  thumb: string | null
  assigned?: boolean
}

// Physical棚のタブ(2026-08-07 Andy承認)。Events棚を吸収し、棚の定義を
// 「物理作品のアーカイブ」から「物理世界にあるもの・あったこと」へ広げた。
// もの(OBJECT)と こと(EVENT)= 世界にあるものの二分法をそのままタブにする
const TABS = ['ALL', 'OBJECT', 'EVENT'] as const
type Tab = (typeof TABS)[number]

export default function PhysicalGrid({ items }: { items: PhysicalItem[] }) {
  const [tab, setTab] = useState<Tab>('ALL')

  // 並びは棚を跨いで公開日の降順(催しは「開催した日」がpublished_at)
  const cells = items
    .filter((i) => tab === 'ALL' || i.kind === tab.toLowerCase())
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
        {cells.map((item) => (
          <div key={item.id}>
            {/* サムネイルは装飾でタイトルは兄弟div。リンク名を与える(2026-07-23) */}
            <Link
              href={`/physical/${item.id}`}
              className="sq"
              aria-label={`${item.kind.toUpperCase()} ${item.title} ${dateShort(item.date)}`}
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
              <span className="ep-show">{item.kind.toUpperCase()}</span>
              <span className="ep-title">{item.title}</span>
              <span className="ep-date">{dateShort(item.date)}</span>
            </div>
          </div>
        ))}
      </div>
      {cells.length === 0 && <p className="shelf-empty">まだ何もありません</p>}
    </section>
  )
}
