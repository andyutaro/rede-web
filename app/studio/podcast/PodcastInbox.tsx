'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { dateDots } from '@/lib/site/text'

export type InboxRow = {
  showSlug: string
  showLabel: string
  episodeId: string
  title: string
  date: string
  tags: string[]
  hidden: boolean // ゴミ箱(Inboxから見えなくするフラグ。RSSが真実なので物理削除は無い)
}

type Filter = 'untagged' | 'all' | 'trash'

// 未タグ/全件/ゴミ箱の切替+行ごとのタグ入力+チェックボックス一括操作。
// タグ保存は行単位(保存ボタン or Enter)。ゴミ箱=hiddenフラグ(いつでも戻せる)。
export default function PodcastInbox({ rows }: { rows: InboxRow[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('untagged')
  const [saved, setSaved] = useState<Map<string, string[]>>(
    () => new Map(rows.map((r) => [key(r), r.tags]))
  )
  const [hiddenMap, setHiddenMap] = useState<Map<string, boolean>>(
    () => new Map(rows.map((r) => [key(r), r.hidden]))
  )
  const [editing, setEditing] = useState<Map<string, string>>(() => new Map())
  const [status, setStatus] = useState<Map<string, 'saving' | 'saved' | 'error'>>(() => new Map())
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  function key(r: InboxRow) {
    return `${r.showSlug}/${r.episodeId}`
  }

  async function saveTags(r: InboxRow) {
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

  async function bulkHide(hide: boolean) {
    if (selected.size === 0 || busy) return
    setBusy(true)
    setMessage('')
    const items = rows.filter((r) => selected.has(key(r))).map((r) => ({
      showSlug: r.showSlug,
      episodeId: r.episodeId,
    }))
    try {
      const res = await fetch('/api/episode-tags', {
        method: 'POST',
        body: JSON.stringify({ action: hide ? 'hide' : 'unhide', items }),
      })
      if (!res.ok) throw new Error()
      setHiddenMap((m) => {
        const next = new Map(m)
        for (const r of rows) if (selected.has(key(r))) next.set(key(r), hide)
        return next
      })
      setSelected(new Set())
      router.refresh()
    } catch {
      setMessage('操作に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  function isHidden(r: InboxRow) {
    return hiddenMap.get(key(r)) ?? false
  }

  const shown = rows.filter((r) => {
    if (filter === 'trash') return isHidden(r)
    if (isHidden(r)) return false
    if (filter === 'untagged') return (saved.get(key(r)) ?? []).length === 0
    return true
  })
  const untaggedCount = rows.filter((r) => !isHidden(r) && (saved.get(key(r)) ?? []).length === 0).length
  const activeCount = rows.filter((r) => !isHidden(r)).length
  const trashCount = rows.filter((r) => isHidden(r)).length

  function toggle(k: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  function toggleAll() {
    const keys = shown.map((r) => key(r))
    setSelected((prev) => (prev.size === keys.length ? new Set() : new Set(keys)))
  }

  return (
    <>
      <div className="inbox-filter">
        {(
          [
            ['untagged', `未タグ(${untaggedCount})`],
            ['all', `全件(${activeCount})`],
            ['trash', `ゴミ箱(${trashCount})`],
          ] as const
        ).map(([f, label]) => (
          <button
            key={f}
            type="button"
            className={filter === f ? 'active' : ''}
            onClick={() => {
              setFilter(f)
              setSelected(new Set())
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {shown.length > 0 && (
        <div className="studio-bulkbar">
          <label className="bulk-all">
            <input
              type="checkbox"
              checked={selected.size === shown.length && shown.length > 0}
              onChange={toggleAll}
              aria-label="全選択"
            />
            <span>{selected.size > 0 ? `${selected.size}件選択中` : '全選択'}</span>
          </label>
          {filter === 'trash' ? (
            <button
              type="button"
              className="bulk-btn"
              disabled={selected.size === 0 || busy}
              onClick={() => bulkHide(false)}
            >
              選択を元に戻す
            </button>
          ) : (
            <button
              type="button"
              className="bulk-btn"
              disabled={selected.size === 0 || busy}
              onClick={() => bulkHide(true)}
            >
              選択をゴミ箱へ
            </button>
          )}
          <span className="bulk-message">{message}</span>
        </div>
      )}

      <div>
        {shown.map((r) => {
          const k = key(r)
          const st = status.get(k)
          return (
            <div className="inbox-row" key={k}>
              <input
                type="checkbox"
                className="row-check"
                checked={selected.has(k)}
                onChange={() => toggle(k)}
                aria-label={`${r.title} を選択`}
              />
              <span className="row-date">{dateDots(r.date)}</span>
              <span className="row-show">{r.showLabel}</span>
              <span className="row-ep" title={r.title}>
                {r.title}
              </span>
              {filter !== 'trash' && (
                <>
                  <input
                    value={editing.get(k) ?? (saved.get(k) ?? []).join(', ')}
                    onChange={(e) => setEditing((m) => new Map(m).set(k, e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveTags(r)
                    }}
                    placeholder="タグ(カンマ区切り)"
                    aria-label={`${r.title} のタグ`}
                  />
                  <button
                    type="button"
                    className={`row-save${st === 'saved' ? ' saved' : ''}`}
                    onClick={() => saveTags(r)}
                  >
                    {st === 'saving' ? '…' : st === 'saved' ? '保存済' : st === 'error' ? '失敗' : '保存'}
                  </button>
                </>
              )}
            </div>
          )
        })}
        {shown.length === 0 && (
          <p className="studio-empty">
            {filter === 'trash' ? 'ゴミ箱は空です' : '該当するエピソードはありません'}
          </p>
        )}
      </div>
    </>
  )
}
