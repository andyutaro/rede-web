'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dateDots } from '@/lib/site/text'
import TagPicker from '../TagPicker'

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

// 未タグ/全件/ゴミ箱の切替+行ごとのタグ付け(TagPicker=既存タグのサジェスト付き)
// +チェックボックス一括操作。タグ保存は行単位。ゴミ箱=hiddenフラグ(いつでも戻せる)。
export default function PodcastInbox({ rows, tagVocabulary }: { rows: InboxRow[]; tagVocabulary: string[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('untagged')
  const [saved, setSaved] = useState<Map<string, string[]>>(
    () => new Map(rows.map((r) => [key(r), r.tags]))
  )
  const [hiddenMap, setHiddenMap] = useState<Map<string, boolean>>(
    () => new Map(rows.map((r) => [key(r), r.hidden]))
  )
  const [editing, setEditing] = useState<Map<string, string[]>>(() => new Map())
  // 行ごとの未確定入力(保存時に含める=打ちかけでも保存ボタンで拾う)
  const draftsRef = useRef<Map<string, string>>(new Map())
  const [status, setStatus] = useState<Map<string, 'saving' | 'saved' | 'error'>>(() => new Map())
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [q, setQ] = useState('') // タイトル・番組名・タグの検索(2026-07-17)

  function key(r: InboxRow) {
    return `${r.showSlug}/${r.episodeId}`
  }

  async function saveTags(r: InboxRow) {
    const k = key(r)
    const draft = (draftsRef.current.get(k) ?? '').trim()
    const tags = [...(editing.get(k) ?? saved.get(k) ?? [])]
    if (draft && !tags.includes(draft)) tags.push(draft)
    setStatus((m) => new Map(m).set(k, 'saving'))
    try {
      const res = await fetch('/api/episode-tags', {
        method: 'POST',
        body: JSON.stringify({ showSlug: r.showSlug, episodeId: r.episodeId, tags }),
      })
      if (!res.ok) throw new Error()
      setSaved((m) => new Map(m).set(k, tags))
      setEditing((m) => new Map(m).set(k, tags)) // 打ちかけ分を含めた確定形をチップに反映
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

  const needle = q.trim().toLowerCase()
  const shown = rows.filter((r) => {
    if (filter === 'trash') {
      if (!isHidden(r)) return false
    } else {
      if (isHidden(r)) return false
      if (filter === 'untagged' && (saved.get(key(r)) ?? []).length > 0) return false
    }
    if (!needle) return true
    return (
      r.title.toLowerCase().includes(needle) ||
      r.showLabel.toLowerCase().includes(needle) ||
      (saved.get(key(r)) ?? []).some((t) => t.toLowerCase().includes(needle))
    )
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
        <input
          type="search"
          className="toolbar-search"
          placeholder="タイトル・番組・タグを検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="エピソードを検索"
        />
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
                  <div className="inbox-tagpicker">
                    <TagPicker
                      value={editing.get(k) ?? saved.get(k) ?? []}
                      onChange={(tags) => setEditing((m) => new Map(m).set(k, tags))}
                      vocabulary={tagVocabulary}
                      placeholder="タグ"
                      onDraftChange={(d) => draftsRef.current.set(k, d)}
                    />
                  </div>
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
