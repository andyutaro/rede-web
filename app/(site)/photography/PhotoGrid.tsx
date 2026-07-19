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

// Photography一覧のタブ(NotesのALL/ARTICLE/SCRIBEと同型、2026-07-11)
const TABS = ['ALL', 'ARTWORK', 'PHOTOLOG'] as const
type Tab = (typeof TABS)[number]

export default function PhotoGrid({ items }: { items: PhotoItem[] }) {
  const [tab, setTab] = useState<Tab>('ALL')
  const shown = items.filter((i) => tab === 'ALL' || i.kind === tab.toLowerCase())

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
        {shown.map((item) => (
          <div key={item.id}>
            <Link href={`/photography/${item.id}`} className="sq">
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
      {shown.length === 0 && <p className="shelf-empty">まだ作品がありません</p>}
    </section>
  )
}
