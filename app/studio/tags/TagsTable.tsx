'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type TagRow = { tag: string; notes: number; podcast: number }

// タグの一覧+リネーム(既存名へのリネーム=統合)+削除。
// 操作はすべて横断(articles+episode_tags)に効く
export default function TagsTable({ rows }: { rows: TagRow[] }) {
  const router = useRouter()
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function apply(from: string, to: string | null) {
    if (busy) return
    if (to !== null) {
      const t = to.trim()
      if (!t || t === from) {
        setEditing(null)
        return
      }
      if (rows.some((r) => r.tag === t)) {
        const ok = window.confirm(`「${from}」を既存のタグ「${t}」に統合します。よろしいですか？`)
        if (!ok) return
      }
    } else {
      const ok = window.confirm(`タグ「${from}」を全コンテンツから削除します。よろしいですか？`)
      if (!ok) return
    }
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        body: JSON.stringify({ from, to: to === null ? null : to.trim() }),
      })
      if (!res.ok) throw new Error()
      setEditing(null)
      router.refresh()
    } catch {
      setMessage('操作に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  if (rows.length === 0) {
    return <p className="studio-empty">タグはまだありません(記事・エピソードに付けるとここに並びます)</p>
  }

  return (
    <>
      <div className="studio-status-line">{message}</div>
      <div>
        {rows.map((r) => (
          <div className="studio-row" key={r.tag}>
            {editing === r.tag ? (
              <input
                className="tag-rename-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) apply(r.tag, draft)
                  if (e.key === 'Escape') setEditing(null)
                }}
                aria-label={`${r.tag} の新しい名前`}
                autoFocus
              />
            ) : (
              <span className="row-title">{r.tag}</span>
            )}
            <span className="row-tags">
              NOTES {r.notes} / PODCAST {r.podcast}
            </span>
            {editing === r.tag ? (
              <>
                <button type="button" className="bulk-btn" disabled={busy} onClick={() => apply(r.tag, draft)}>
                  保存
                </button>
                <button type="button" className="bulk-btn" onClick={() => setEditing(null)}>
                  取消
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="bulk-btn"
                  onClick={() => {
                    setEditing(r.tag)
                    setDraft(r.tag)
                  }}
                >
                  リネーム
                </button>
                <button
                  type="button"
                  className="bulk-btn bulk-danger"
                  disabled={busy}
                  onClick={() => apply(r.tag, null)}
                >
                  削除
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
