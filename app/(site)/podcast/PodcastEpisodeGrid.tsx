'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { dateShort } from '@/lib/site/text'
import { imgThumb, IMG_W } from '@/lib/site/img'

export type EpItem = {
  key: string
  slug: string
  epId: string
  title: string
  date: string
  thumb: string | null
  showLabel: string
  // guest = 他番組にゲスト出演した回(2026-09-10)。番組タイル(ORIGINAL/WORKS)は
  // 「Andyが作っている番組」の記号なので他人の番組は並べないが、**エピソードの
  // タイルは記号が別**なのでここには同じ文法で並べられる
  group: 'original' | 'works' | 'guest'
  // 既定は /podcast/[slug]/[epId]。ゲスト回だけ別ルートを持つ
  href?: string
}

const TABS = ['ALL', 'ORIGINAL', 'WORKS', 'GUEST'] as const
type Tab = (typeof TABS)[number]

// newSince: この日付以降のエピソードに赤のNEWドット(7日以内の新着、2026-07-20)
export default function PodcastEpisodeGrid({
  episodes,
  total,
  newSince = '9999-12-31',
  heading,
  allHref,
  limit,
}: {
  episodes: EpItem[]
  total: number
  newSince?: string
  // Homeの「最新エピソード」(2026-09-11 Andy指定): 見出しを渡すと、タブ・検索・
  // 件数を出さず「見出し+ALL →」だけの形になる。タイルの組版は棚と同じまま
  heading?: string
  allHref?: string
  limit?: number
}) {
  const [tab, setTab] = useState<Tab>('ALL')
  const [query, setQuery] = useState('')
  const compact = Boolean(heading)

  const shown = useMemo(() => {
    let list = episodes
    if (tab !== 'ALL') list = list.filter((e) => e.group === tab.toLowerCase())
    const q = query.trim()
    if (q) list = list.filter((e) => e.title.toLowerCase().includes(q.toLowerCase()) || e.showLabel.toLowerCase().includes(q.toLowerCase()))
    return limit ? list.slice(0, limit) : list
  }, [episodes, tab, query, limit])

  return (
    <section className="section">
      {compact ? (
        <div className="section-head">
          <h2>{heading}</h2>
          {allHref && <Link href={allHref}>ALL →</Link>}
        </div>
      ) : (
      <>
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
      </>
      )}

      <div className="section-body grid4">
        {shown.map((ep) => (
          <div key={ep.key}>
            {/* 同上(2026-07-23)。ここは301タイルあり、名前が無いと一覧から
                目的の回を選ぶ操作が事実上できなかった。新着はラベル側で伝える */}
            <Link
              href={ep.href ?? `/podcast/${ep.slug}/${ep.epId}`}
              className="sq"
              aria-label={`${ep.showLabel} ${ep.title} ${dateShort(ep.date)}${ep.date >= newSince ? ' 新着' : ''}`}
            >
              {ep.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgThumb(ep.thumb, IMG_W.ep)} alt="" loading="lazy" decoding="async" className="cover-frame" />
              ) : (
                <span className="empty-cell" />
              )}
            </Link>
            <div className="ep-cell-label">
              <span className="ep-show">{ep.showLabel}</span>
              <span className="ep-title">{ep.title}</span>
              <span className="ep-date">
                {dateShort(ep.date)}
                {ep.date >= newSince && <span className="new-dot" aria-label="新着" />}
              </span>
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
