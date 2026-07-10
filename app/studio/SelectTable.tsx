'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { dateDots } from '@/lib/site/text'

// studio共通の選択テーブル(Articles/Photography/scribeで共用)。
// チェックボックス選択+一括操作。mode=active: 選択をゴミ箱へ /
// mode=trash: 元に戻す・完全に消去(confirm付き)。
// endpointは/api/article/delete または /api/scribe/delete(idsの中身がuuid/dateの違いだけ)
export type SelectRow = {
  id: string // APIに渡すids値(articles=uuid, scribe=date)
  date: string // YYYY-MM-DD
  label: string // 状態列(PUBLISHED/DRAFT/FINALIZED等)
  published?: boolean // 緑表示
  title: string
  href?: string // activeで編集リンク(ゴミ箱内はリンクなし=戻してから編集)
  tags?: string[]
}

export default function SelectTable({
  rows,
  mode,
  endpoint,
  emptyText,
}: {
  rows: SelectRow[]
  mode: 'active' | 'trash'
  endpoint: string
  emptyText: string
}) {
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
      const res = await fetch(endpoint, {
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
    return <p className="studio-empty">{emptyText}</p>
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
        {rows.map((r) => (
          <div className="studio-row" key={r.id}>
            <input
              type="checkbox"
              className="row-check"
              checked={selected.has(r.id)}
              onChange={() => toggle(r.id)}
              aria-label={`${r.title} を選択`}
            />
            <span className="row-date">{dateDots(r.date)}</span>
            <span className={`row-status ${r.published ? 'published' : ''}`}>{r.label}</span>
            {r.href ? (
              <Link className="row-title" href={r.href}>
                {r.title}
              </Link>
            ) : (
              <span className="row-title row-title-trash">{r.title}</span>
            )}
            {r.tags && r.tags.length > 0 && <span className="row-tags">{r.tags.join(' / ')}</span>}
          </div>
        ))}
      </div>
    </>
  )
}
