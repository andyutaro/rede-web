'use client'

import { useState } from 'react'
import { dateDots } from '@/lib/site/text'

export type InboxRow = {
  showSlug: string
  showLabel: string
  episodeId: string
  title: string
  date: string
  tags: string[]
}

// 未タグ/全件の切替+行ごとのタグ入力。保存は行単位(保存ボタン or Enter)。
export default function PodcastInbox({ rows }: { rows: InboxRow[] }) {
  const [filter, setFilter] = useState<'untagged' | 'all'>('untagged')
  // タグの現在値(保存済み)と入力中の値を行キーで持つ
  const [saved, setSaved] = useState<Map<string, string[]>>(
    () => new Map(rows.map((r) => [key(r), r.tags]))
  )
  const [editing, setEditing] = useState<Map<string, string>>(() => new Map())
  const [status, setStatus] = useState<Map<string, 'saving' | 'saved' | 'error'>>(() => new Map())

  function key(r: InboxRow) {
    return `${r.showSlug}/${r.episodeId}`
  }

  async function save(r: InboxRow) {
    const k = key(r)
    const text = editing.get(k) ?? (saved.get(k) ?? []).join(', ')
    const tags = text
      .split(/[,、]/)
      .map((t) => t.trim())
      .filter(Boolean)
    setStatus((m) => new Map(m).set(k, 'saving'))
    try {
      const res = await fetch('/api/episode-tags', {
        method: 'POST',
        body: JSON.stringify({ showSlug: r.showSlug, episodeId: r.episodeId, tags }),
      })
      if (!res.ok) throw new Error()
      setSaved((m) => new Map(m).set(k, tags))
      setStatus((m) => new Map(m).set(k, 'saved'))
    } catch {
      setStatus((m) => new Map(m).set(k, 'error'))
    }
  }

  const shown = rows.filter((r) => filter === 'all' || (saved.get(key(r)) ?? []).length === 0)
  const untaggedCount = rows.filter((r) => (saved.get(key(r)) ?? []).length === 0).length

  return (
    <>
      <div className="inbox-filter">
        <button
          type="button"
          className={filter === 'untagged' ? 'active' : ''}
          onClick={() => setFilter('untagged')}
        >
          未タグ({untaggedCount})
        </button>
        <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
          全件({rows.length})
        </button>
      </div>
      <div>
        {shown.map((r) => {
          const k = key(r)
          const st = status.get(k)
          return (
            <div className="inbox-row" key={k}>
              <span className="row-date">{dateDots(r.date)}</span>
              <span className="row-show">{r.showLabel}</span>
              <span className="row-ep" title={r.title}>
                {r.title}
              </span>
              <input
                value={editing.get(k) ?? (saved.get(k) ?? []).join(', ')}
                onChange={(e) => setEditing((m) => new Map(m).set(k, e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save(r)
                }}
                placeholder="タグ(カンマ区切り)"
                aria-label={`${r.title} のタグ`}
              />
              <button
                type="button"
                className={`row-save${st === 'saved' ? ' saved' : ''}`}
                onClick={() => save(r)}
              >
                {st === 'saving' ? '…' : st === 'saved' ? '保存済' : st === 'error' ? '失敗' : '保存'}
              </button>
            </div>
          )
        })}
        {shown.length === 0 && <p className="studio-empty">未タグのエピソードはありません</p>}
      </div>
    </>
  )
}
