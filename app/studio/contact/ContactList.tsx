'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { dateDots } from '@/lib/site/text'

export type ContactRow = {
  id: string
  name: string
  email: string
  topics: string[]
  message: string
  createdAt: string
  read: boolean
  deleted: boolean
}

type Filter = 'unread' | 'all' | 'trash'

// 問い合わせ受信箱: 行クリックで本文展開(展開と同時に既読)。
// チェックボックス一括操作(既読/未読/ゴミ箱/復元/完全消去)。
export default function ContactList({ rows }: { rows: ContactRow[] }) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>('unread')
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const shown = rows.filter((r) => {
    if (filter === 'trash') return r.deleted
    if (r.deleted) return false
    if (filter === 'unread') return !r.read
    return true
  })
  const unreadCount = rows.filter((r) => !r.deleted && !r.read).length
  const allCount = rows.filter((r) => !r.deleted).length
  const trashCount = rows.filter((r) => r.deleted).length

  async function act(action: 'read' | 'unread' | 'trash' | 'restore' | 'purge', ids: string[]) {
    if (ids.length === 0 || busy) return
    if (action === 'purge') {
      if (!window.confirm(`選択した${ids.length}件を完全に消去します。よろしいですか？`)) return
    }
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/contact/manage', {
        method: 'POST',
        body: JSON.stringify({ ids, action }),
      })
      if (!res.ok) throw new Error()
      setSelected(new Set())
      router.refresh()
    } catch {
      setMessage('操作に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  function toggleOpen(r: ContactRow) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(r.id)) next.delete(r.id)
      else next.add(r.id)
      return next
    })
    if (!r.read && !r.deleted) act('read', [r.id]) // 開いたら既読
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      <div className="inbox-filter">
        {(
          [
            ['unread', `未読(${unreadCount})`],
            ['all', `全件(${allCount})`],
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
              onChange={() =>
                setSelected((prev) =>
                  prev.size === shown.length ? new Set() : new Set(shown.map((r) => r.id))
                )
              }
              aria-label="全選択"
            />
            <span>{selected.size > 0 ? `${selected.size}件選択中` : '全選択'}</span>
          </label>
          {filter === 'trash' ? (
            <>
              <button type="button" className="bulk-btn" disabled={selected.size === 0 || busy} onClick={() => act('restore', [...selected])}>
                選択を元に戻す
              </button>
              <button type="button" className="bulk-btn bulk-danger" disabled={selected.size === 0 || busy} onClick={() => act('purge', [...selected])}>
                選択を完全に消去
              </button>
            </>
          ) : (
            <>
              <button type="button" className="bulk-btn" disabled={selected.size === 0 || busy} onClick={() => act(filter === 'unread' ? 'read' : 'unread', [...selected])}>
                {filter === 'unread' ? '選択を既読に' : '選択を未読に'}
              </button>
              <button type="button" className="bulk-btn" disabled={selected.size === 0 || busy} onClick={() => act('trash', [...selected])}>
                選択をゴミ箱へ
              </button>
            </>
          )}
          <span className="bulk-message">{message}</span>
        </div>
      )}

      <div>
        {shown.map((r) => (
          <div className={`contact-row${r.read ? '' : ' unread'}`} key={r.id}>
            <div className="contact-row-head">
              <input
                type="checkbox"
                className="row-check"
                checked={selected.has(r.id)}
                onChange={() => toggleSelect(r.id)}
                aria-label={`${r.name} を選択`}
              />
              <span className="row-date">{dateDots(r.createdAt.slice(0, 10))}</span>
              <button type="button" className="contact-row-title" onClick={() => toggleOpen(r)}>
                <span className="contact-name">{r.name}</span>
                <span className="contact-email">{r.email}</span>
                {r.topics.length > 0 && <span className="contact-topics">{r.topics.join(' / ')}</span>}
              </button>
            </div>
            {open.has(r.id) && (
              <div className="contact-body">
                <p>{r.message}</p>
                <a className="contact-reply" href={`mailto:${r.email}`}>
                  メールで返信 →
                </a>
              </div>
            )}
          </div>
        ))}
        {shown.length === 0 && (
          <p className="studio-empty">
            {filter === 'trash' ? 'ゴミ箱は空です' : filter === 'unread' ? '未読はありません' : '問い合わせはまだありません'}
          </p>
        )}
      </div>
    </>
  )
}
