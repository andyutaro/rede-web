'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { dateShort } from '@/lib/site/text'

export type EpItem = {
  key: string
  slug: string
  epId: string
  title: string
  date: string
  thumb: string | null
  showLabel: string
  group: 'original' | 'works'
}

const TABS = ['ALL', 'ORIGINAL', 'WORKS'] as const
type Tab = (typeof TABS)[number]

export default function PodcastEpisodeGrid({ episodes, total }: { episodes: EpItem[]; total: number }) {
  const [tab, setTab] = useState<Tab>('ALL')
  const [query, setQuery] = useState('')

  const shown = useMemo(() => {
    let list = episodes
    if (tab !== 'ALL') list = list.filter((e) => e.group === tab.toLowerCase())
    const q = query.trim()
    if (q) list = list.filter((e) => e.title.toLowerCase().includes(q.toLowerCase()) || e.showLabel.toLowerCase().includes(q.toLowerCase()))
    return list
  }, [episodes, tab, query])

  return (
    <section className="section">
      <div className="section-head podcast-ep-head">
        <div className="podcast-ep-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              className={`podcast-ep-tab${tab === t ? ' active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        <span className="podcast-ep-count">{shown.length} / {total}</span>
      </div>

      <div className="podcast-ep-search">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="エピソードを検索"
          aria-label="エピソードを検索"
        />
      </div>

      <div className="section-body grid4">
        {shown.map((ep) => (
          <div key={ep.key}>
            <Link href={`/podcast/${ep.slug}/${ep.epId}`} className="sq">
              {ep.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={ep.thumb} alt="" loading="lazy" className="cover-frame" />
              ) : (
                <span className="empty-cell" />
              )}
            </Link>
            <div className="ep-cell-label">
              <span className="ep-show">{ep.showLabel}</span>
              <span className="ep-title">{ep.title}</span>
              <span className="ep-date">{dateShort(ep.date)}</span>
            </div>
          </div>
        ))}
      </div>

      {shown.length === 0 && (
        <p className="podcast-ep-empty">該当なし</p>
      )}
    </section>
  )
}
