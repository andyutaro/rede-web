'use client'

import { useState } from 'react'
import Link from 'next/link'
import { dateShort } from '@/lib/site/text'

export type GridItem = {
  key: string
  kind: 'article' | 'scribe' | 'photography' | 'live'
  date: string // YYYY-MM-DD
  href: string
  thumb?: string | null
  assigned?: boolean // 充当サムネイル: grayscale+opacity 0.55で見分ける(§6)
}

const TABS = ['ALL', 'ARTICLE', 'SCRIBE', 'PHOTOGRAPHY'] as const
type Tab = (typeof TABS)[number]

function visible(item: GridItem, tab: Tab): boolean {
  switch (tab) {
    case 'ALL':
      return true
    case 'ARTICLE':
      return item.kind === 'article'
    case 'SCRIBE':
      // LIVEセルはALL/SCRIBEタブでのみ表示(§6)
      return item.kind === 'scribe' || item.kind === 'live'
    case 'PHOTOGRAPHY':
      return item.kind === 'photography'
  }
}

export default function ArticleGrid({ items }: { items: GridItem[] }) {
  const [tab, setTab] = useState<Tab>('ALL')
  const shown = items.filter((i) => visible(i, tab))

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
        {shown.map((item) =>
          item.kind === 'live' ? (
            <div key={item.key}>
              <Link href={item.href} className="sq">
                <span className="live-cell">
                  <span className="ripple" aria-hidden="true" />
                  <span className="core" aria-hidden="true" />
                </span>
              </Link>
              <div className="cell-label is-live">SCRIBE — LIVE {dateShort(item.date)}</div>
            </div>
          ) : (
            <div key={item.key}>
              <Link href={item.href} className="sq">
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
              <div className="cell-label">
                {item.kind.toUpperCase()} {dateShort(item.date)}
              </div>
            </div>
          )
        )}
      </div>
    </section>
  )
}
