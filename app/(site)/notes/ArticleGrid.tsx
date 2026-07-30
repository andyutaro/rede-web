'use client'

import { useState } from 'react'
import Link from 'next/link'
import { dateShort } from '@/lib/site/text'
import { imgThumb, IMG_W } from '@/lib/site/img'

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
const TABS = ['ALL', 'ARTICLE', 'DESK'] as const

// 内側の呼び名(kind)は'scribe'のまま——DBのテーブル名・注釈の対象種別・
// APIの経路が全部その名前で動いているので触らない。
// **見える名前だけ**をDESKにする(2026-07-30 scribe→deskの改名)
function kindLabel(kind: string): string {
  return kind === 'scribe' || kind === 'live' ? 'DESK' : kind.toUpperCase()
}
type Tab = (typeof TABS)[number]

function visible(item: GridItem, tab: Tab): boolean {
  switch (tab) {
    case 'ALL':
      return true
    case 'ARTICLE':
      return item.kind === 'article'
    case 'DESK':
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
              {/* 中身は装飾のspanだけなのでリンクに名前が無かった(2026-07-23)。
                  可視ラベルと同じ文言を読み上げ名にする(表示は変わらない) */}
              <Link href={item.href} className="sq" aria-label={`DESK LIVE ${dateShort(item.date)}`}>
                <span className="live-cell">
                  <span className="ripple" aria-hidden="true" />
                  <span className="core" aria-hidden="true" />
                </span>
              </Link>
              {/* ラベルは他セルと同じ3段構成で揃える(LIVE行だけ赤) */}
              <div className="ep-cell-label">
                <span className="ep-show">DESK</span>
                <span className="ep-title is-live">LIVE</span>
                <span className="ep-date">{dateShort(item.date)}</span>
              </div>
            </div>
          ) : (
            <div key={item.key}>
              {/* サムネイルはalt=""(装飾)なのでリンク名が空だった(2026-07-23)。
                  タイトルは兄弟divにあり読み上げ名にならない。可視ラベルと同じ文言を与える */}
              <Link
                href={item.href}
                className="sq"
                aria-label={`${kindLabel(item.kind)} ${item.title ?? (item.kind === 'scribe' ? 'Archive' : '')} ${dateShort(item.date)}`}
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
              {/* 全セル共通の3段ラベル(種別/タイトル/日付)。
                  確定scribeはタイトルを持たないため規則名「Archive」を置く */}
              <div className="ep-cell-label">
                <span className="ep-show">{kindLabel(item.kind)}</span>
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
