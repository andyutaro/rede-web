'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { dateDots } from '@/lib/site/text'

export type ArticleRow = {
  id: string
  title: string
  type: string
  status: string
  tags: string[]
  date: string // YYYY-MM-DD(published_at ?? created_at)
}

// Articles一覧のテーブル(チェックボックス選択+一括操作)。
// mode=active: 選択をゴミ箱へ / mode=trash: 元に戻す・完全に消去(confirm付き)
export default function ArticlesTable({ rows, mode }: { rows: ArticleRow[]; mode: 'active' | 'trash' }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))))
  }

  async function act(action: 'trash' | 'restore' | 'purge') {
    if (selected.size === 0 || busy) return
    if (action === 'purge') {
      const ok = window.confirm(
        `選択した${selected.size}件を完全に消去します。この操作は取り消せません。よろしいですか？`
      )
      if (!ok) return
    }
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/article/delete', {
        method: 'POST',
        body: JSON.stringify({ ids: [...selected], action }),
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

  if (rows.length === 0) {
    return (
      <p className="studio-empty">
        {mode === 'trash' ? 'ゴミ箱は空です' : '記事がまだありません'}
      </p>
    )
  }

  return (
    <>
      <div className="studio-bulkbar">
        <label className="bulk-all">
          <input
            type="checkbox"
            checked={selected.size === rows.length && rows.length > 0}
            onChange={toggleAll}
            aria-label="全選択"
          />
          <span>{selected.size > 0 ? `${selected.size}件選択中` : '全選択'}</span>
        </label>
        {mode === 'active' ? (
          <button
            type="button"
            className="bulk-btn"
            disabled={selected.size === 0 || busy}
            onClick={() => act('trash')}
          >
            選択をゴミ箱へ
          </button>
        ) : (
          <>
            <button
              type="button"
              className="bulk-btn"
              disabled={selected.size === 0 || busy}
              onClick={() => act('restore')}
            >
              選択を元に戻す
            </button>
            <button
              type="button"
              className="bulk-btn bulk-danger"
              disabled={selected.size === 0 || busy}
              onClick={() => act('purge')}
            >
              選択を完全に消去
            </button>
          </>
        )}
        <span className="bulk-message">{message}</span>
      </div>
      <div>
        {rows.map((a) => (
          <div className="studio-row" key={a.id}>
            <input
              type="checkbox"
              className="row-check"
              checked={selected.has(a.id)}
              onChange={() => toggle(a.id)}
              aria-label={`${a.title || '(無題)'} を選択`}
            />
            <span className="row-date">{dateDots(a.date)}</span>
            <span className={`row-status ${a.status}`}>
              {a.status.toUpperCase()}
              {a.type === 'photography' ? ' / PHOTO' : ''}
            </span>
            {mode === 'active' ? (
              <Link className="row-title" href={`/studio/articles/${a.id}`}>
                {a.title || '(無題)'}
              </Link>
            ) : (
              // ゴミ箱内は編集導線を持たない(戻してから編集)
              <span className="row-title row-title-trash">{a.title || '(無題)'}</span>
            )}
            {a.tags.length > 0 && <span className="row-tags">{a.tags.join(' / ')}</span>}
          </div>
        ))}
      </div>
    </>
  )
}
