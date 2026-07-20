'use client'

import Link from 'next/link'
import { useState } from 'react'
import { dateDots } from '@/lib/site/text'

// 番組ページのエピソード索引(2026-07-20)。
// - 検索: タイトル+概要欄(プレーン化済みテキスト)の部分一致。アプリの検索は
//   タイトルしか見ないため「あの話どの回だっけ」が引けるのはここだけ
// - NEWドット: 7日以内の新着回に赤点(彩色は赤のみの原則に整合)
export type IndexRow = {
  id: string
  title: string
  date: string // YYYY-MM-DD
  href: string
  searchText: string // タイトル+概要欄のプレーンテキスト(検索用)
}

export default function EpisodeIndex({ rows, newSince }: { rows: IndexRow[]; newSince: string }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const shown = needle
    ? rows.filter(
        (r) => r.title.toLowerCase().includes(needle) || r.searchText.toLowerCase().includes(needle)
      )
    : rows

  return (
    <section className="section">
      <div className="section-head">
        <span>EPISODES — {needle ? `${shown.length}/${rows.length}` : rows.length}</span>
      </div>
      {/* 検索(下線1本の文法=Notesのアーカイブ検索と同じ) */}
      <div className="article-search ep-search">
        <input
          type="search"
          placeholder="タイトル・話題でエピソードを検索"
          aria-label="エピソードを検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="section-body ep-index-body">
        {shown.map((ep) => (
          <div className="update-row" key={ep.id}>
            <Link href={ep.href}>
              <span className="update-date">{dateDots(ep.date)}</span>
              <span className="update-excerpt">
                {ep.title}
                {ep.date >= newSince && <span className="new-dot" aria-label="新着" />}
              </span>
            </Link>
          </div>
        ))}
        {shown.length === 0 && <p className="podcast-ep-empty">該当なし</p>}
      </div>
    </section>
  )
}
