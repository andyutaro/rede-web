'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { dateDots } from '@/lib/site/text'

// studio共通の選択テーブル(NOTES/Photography/Updates/各TRASHで共用)。
// v2(2026-07-17): ヘッダー行・検索・状態/サムネ出所フィルタ・日付ソート・
// 行単位クイック操作(選択不要のゴミ箱へ/戻す)を追加。
// チェックボックス選択+一括操作は従来通り。
// endpointは/api/article/delete等(idsの中身がuuid/dateの違いだけ)
export type SelectRow = {
  id: string // APIに渡すids値(articles=uuid, scribe=date)
  date: string // YYYY-MM-DD
  label: string // 状態列(PUBLISHED/DRAFT/FINALIZED等)
  published?: boolean // 緑表示
  title: string
  href?: string // activeで編集リンク(ゴミ箱内はリンクなし=戻してから編集)
  tags?: string[]
  // サムネイル列(2026-07-17): 実物プレビュー+出所バッジ。
  // manual=専用 / first_image=本文 / assigned=充当(借り物) / none=なし
  thumb?: string | null
  thumbSource?: 'manual' | 'first_image' | 'assigned' | 'none'
}

// 出所バッジの表示(短い日本語+色分け。noneは要対応として赤系)
const THUMB_BADGE: Record<string, { label: string; cls: string }> = {
  manual: { label: '専用', cls: 'thumb-manual' },
  first_image: { label: '本文', cls: 'thumb-first' },
  assigned: { label: '充当', cls: 'thumb-assigned' },
  none: { label: 'なし', cls: 'thumb-none' },
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
  // フィルタ・検索・ソート(すべてクライアント側=行は読み込み済み)
  const [q, setQ] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [thumbFilter, setThumbFilter] = useState('all')
  const [dateAsc, setDateAsc] = useState(false)

  const hasThumbs = rows.some((r) => r.thumbSource)
  const statusOptions = useMemo(() => [...new Set(rows.map((r) => r.label))].sort(), [rows])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const filtered = rows.filter((r) => {
      if (statusFilter !== 'all' && r.label !== statusFilter) return false
      if (thumbFilter !== 'all' && (r.thumbSource ?? 'none') !== thumbFilter) return false
      if (
        needle &&
        !r.title.toLowerCase().includes(needle) &&
        !(r.tags ?? []).some((t) => t.toLowerCase().includes(needle))
      )
        return false
      return true
    })
    return [...filtered].sort((a, b) => (dateAsc ? (a.date < b.date ? -1 : 1) : a.date > b.date ? -1 : 1))
  }, [rows, q, statusFilter, thumbFilter, dateAsc])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 全選択は「いま表示されている行」に対して効く(フィルタと組み合わせた一括操作)
  function toggleAll() {
    setSelected((prev) =>
      prev.size === shown.length && shown.length > 0 ? new Set() : new Set(shown.map((r) => r.id))
    )
  }

  async function act(action: 'trash' | 'restore' | 'purge', ids: string[]) {
    if (ids.length === 0 || busy) return
    if (action === 'purge') {
      const ok = window.confirm(
        `選択した${ids.length}件を完全に消去します。この操作は取り消せません。よろしいですか？`
      )
      if (!ok) return
    }
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch(endpoint, {
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

  if (rows.length === 0) {
    return <p className="studio-empty">{emptyText}</p>
  }

  return (
    <>
      {/* 検索+フィルタ(該当機能があるテーブルにだけ出す) */}
      <div className="studio-toolbar">
        <input
          type="search"
          className="toolbar-search"
          placeholder="タイトル・タグを検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="タイトル・タグを検索"
        />
        {statusOptions.length > 1 && (
          <select
            className="toolbar-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            aria-label="状態で絞り込み"
          >
            <option value="all">状態: すべて</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        {hasThumbs && (
          <select
            className="toolbar-select"
            value={thumbFilter}
            onChange={(e) => setThumbFilter(e.target.value)}
            aria-label="サムネイル出所で絞り込み"
          >
            <option value="all">サムネ: すべて</option>
            <option value="manual">専用のみ</option>
            <option value="first_image">本文のみ</option>
            <option value="assigned">充当のみ(借り物)</option>
            <option value="none">なしのみ</option>
          </select>
        )}
        <span className="toolbar-count">
          {shown.length === rows.length ? `${rows.length}件` : `${rows.length}件中${shown.length}件`}
        </span>
      </div>

      <div className="studio-bulkbar">
        <label className="bulk-all">
          <input
            type="checkbox"
            checked={selected.size === shown.length && shown.length > 0}
            onChange={toggleAll}
            aria-label="表示中を全選択"
          />
          <span>{selected.size > 0 ? `${selected.size}件選択中` : '全選択'}</span>
        </label>
        {mode === 'active' ? (
          <button
            type="button"
            className="bulk-btn"
            disabled={selected.size === 0 || busy}
            onClick={() => act('trash', [...selected])}
          >
            選択をゴミ箱へ
          </button>
        ) : (
          <>
            <button
              type="button"
              className="bulk-btn"
              disabled={selected.size === 0 || busy}
              onClick={() => act('restore', [...selected])}
            >
              選択を元に戻す
            </button>
            <button
              type="button"
              className="bulk-btn bulk-danger"
              disabled={selected.size === 0 || busy}
              onClick={() => act('purge', [...selected])}
            >
              選択を完全に消去
            </button>
          </>
        )}
        <span className="bulk-message">{message}</span>
      </div>

      {/* ヘッダー行(表としての整理)。日付クリックで昇順/降順 */}
      <div className="studio-row studio-row-head" aria-hidden="true">
        <span className="row-check" />
        <button type="button" className="row-date head-sort" onClick={() => setDateAsc((v) => !v)}>
          日付 {dateAsc ? '↑' : '↓'}
        </button>
        <span className="row-status">状態</span>
        {hasThumbs && <span className="row-thumb head-label">サムネ</span>}
        <span className="row-title head-label">タイトル</span>
      </div>

      <div>
        {shown.map((r) => (
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
            {r.thumbSource && (
              <span className="row-thumb">
                {r.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.thumb} alt="" loading="lazy" />
                ) : (
                  <span className="row-thumb-empty" aria-hidden="true" />
                )}
                <span className={`row-thumb-badge ${THUMB_BADGE[r.thumbSource].cls}`}>
                  {THUMB_BADGE[r.thumbSource].label}
                </span>
              </span>
            )}
            {r.href ? (
              <Link className="row-title" href={r.href}>
                {r.title}
              </Link>
            ) : (
              <span className="row-title row-title-trash">{r.title}</span>
            )}
            {r.tags && r.tags.length > 0 && <span className="row-tags">{r.tags.join(' / ')}</span>}
            {/* 行単位クイック操作(選択不要)。誤操作の質が違うpurgeは一括バーのみ */}
            <span className="row-actions">
              {mode === 'active' ? (
                <button type="button" className="row-act" disabled={busy} onClick={() => act('trash', [r.id])}>
                  ゴミ箱へ
                </button>
              ) : (
                <button type="button" className="row-act" disabled={busy} onClick={() => act('restore', [r.id])}>
                  戻す
                </button>
              )}
            </span>
          </div>
        ))}
        {shown.length === 0 && <p className="studio-empty">条件に合う行がありません</p>}
      </div>
    </>
  )
}
