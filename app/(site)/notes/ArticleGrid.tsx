'use client'

import { useState } from 'react'
import Link from 'next/link'
import { dateShort } from '@/lib/site/text'

export type GridItem = {
  key: string
  kind: 'article' | 'scribe' | 'photography' | 'live'
  date: string // YYYY-MM-DD
  href: string
  // タイトルを持つもの(article/photography)はPodcastエピソードと同じ
  // 3段ラベル(種別/タイトル2行クランプ/日付)で表示する
  title?: string
  thumb?: string | null
  assigned?: boolean // 充当サムネイル: grayscale+opacity 0.55で見分ける(§6)
}

// PHOTOGRAPHYタブは独立棚(/photography)への格上げに伴い廃止(2026-07-10)
const TABS = ['ALL', 'ARTICLE', 'SCRIBE'] as const
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
              {/* ラベルは他セルと同じ3段構成で揃える(LIVE行だけ赤) */}
              <div className="ep-cell-label">
                <span className="ep-show">SCRIBE</span>
                <span className="ep-title is-live">LIVE</span>
                <span className="ep-date">{dateShort(item.date)}</span>
              </div>
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
              {/* 全セル共通の3段ラベル(種別/タイトル/日付)。
                  確定scribeはタイトルを持たないため規則名「Archive」を置く */}
              <div className="ep-cell-label">
                <span className="ep-show">{item.kind.toUpperCase()}</span>
                <span className="ep-title">
                  {item.title ?? (item.kind === 'scribe' ? 'Archive' : '')}
                </span>
                <span className="ep-date">{dateShort(item.date)}</span>
              </div>
            </div>
          )
        )}
      </div>
    </section>
  )
}
