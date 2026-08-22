'use client'

import Link from 'next/link'
import { useState } from 'react'
import { dateShort } from '@/lib/site/text'
import { imgThumb, IMG_W } from '@/lib/site/img'

// 番組ページのエピソード索引(2026-07-20)。
// - 検索: タイトル+概要欄(プレーン化済みテキスト)の部分一致。アプリの検索は
//   タイトルしか見ないため「あの話どの回だっけ」が引けるのはここだけ
// - NEWドット: 7日以内の新着回に赤点(彩色は赤のみの原則に整合)
//
// 2026-08-19 Andy指摘で**タイル化**。題名だけの行が延々と並び、こだわった
// サムネイルが一枚も見えていなかった。並びは他の棚(/physical等)と同じ
// 4列グリッド+3段ラベル=新しい見た目を増やさない。
export type IndexRow = {
  id: string
  title: string
  date: string // YYYY-MM-DD
  href: string
  searchText: string // タイトル+概要欄のプレーンテキスト(検索用)
  thumb: string | null // 回のアート。無ければ呼び出し側が番組カバーを入れる
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
        <h2>EPISODES — {needle ? `${shown.length}/${rows.length}` : rows.length}</h2>
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
      <div className="section-body grid4">
        {shown.map((ep) => (
          <div key={ep.id}>
            {/* サムネイルは装飾でタイトルは兄弟div。リンク名を与える(2026-07-23) */}
            <Link href={ep.href} className="sq" aria-label={`${ep.title} ${dateShort(ep.date)}`}>
              {ep.thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imgThumb(ep.thumb, IMG_W.tile)} alt="" loading="lazy" decoding="async" />
              ) : (
                <span className="empty-cell" />
              )}
            </Link>
            <div className="ep-cell-label">
              <span className="ep-title">
                {ep.title}
                {ep.date >= newSince && <span className="new-dot" aria-label="新着" />}
              </span>
              <span className="ep-date">{dateShort(ep.date)}</span>
            </div>
          </div>
        ))}
      </div>
      {shown.length === 0 && <p className="podcast-ep-empty">該当なし</p>}
    </section>
  )
}
