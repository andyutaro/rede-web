'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { dateShort } from '@/lib/site/text'

// BOOKMARKS室の一覧(2026-07-27)。検索(タイトル/URL/周辺テキスト)・
// ドメイン絞り込み・非表示の出し分け・再スキャン/タイトル取得ボタン。
// 絞り込みは全てクライアント側(行数は高々数百=全件持って絞る方が速い)
export type BookmarkRow = {
  url: string
  domain: string
  title: string | null
  fetched: boolean
  sources: { kind: string; label: string; href: string; date: string }[]
  context: string | null
  lastSeen: string
  hidden: boolean
}

export default function BookmarkList({ rows: initial }: { rows: BookmarkRow[] }) {
  const [rows, setRows] = useState(initial)
  const [q, setQ] = useState('')
  const [domain, setDomain] = useState('')
  const [showHidden, setShowHidden] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState('')

  const domains = useMemo(() => {
    const c = new Map<string, number>()
    for (const r of rows) if (!r.hidden) c.set(r.domain, (c.get(r.domain) ?? 0) + 1)
    return [...c.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  const untitled = rows.filter((r) => !r.fetched).length

  const shown = rows.filter((r) => {
    if (r.hidden !== showHidden) return false
    if (domain && r.domain !== domain) return false
    if (q) {
      const hay = `${r.title ?? ''} ${r.url} ${r.context ?? ''} ${r.domain}`.toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  })

  async function post(action: string, extra?: Record<string, unknown>) {
    setBusy(action)
    setNotice('')
    try {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        body: JSON.stringify({ action, ...extra }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error ?? 'failed')
      return j
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '失敗しました')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function rescan() {
    const j = await post('scan')
    if (j) {
      setNotice(`走査: ${j.found}件(新規${j.added}・消滅${j.removed})/ タイトル取得 ${j.titled}/${j.tried}`)
      window.location.reload()
    }
  }

  async function fetchMore() {
    const j = await post('fetch')
    if (j) {
      setNotice(`タイトル取得 ${j.titled}/${j.tried}`)
      if (j.tried > 0) window.location.reload()
    }
  }

  async function toggleHidden(r: BookmarkRow) {
    const j = await post('hide', { url: r.url, hidden: !r.hidden })
    if (j) setRows((prev) => prev.map((x) => (x.url === r.url ? { ...x, hidden: !r.hidden } : x)))
  }

  return (
    <div className="bm">
      <div className="bm-tools">
        <input
          className="bm-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="タイトル・URL・周辺テキストで検索"
        />
        <select value={domain} onChange={(e) => setDomain(e.target.value)}>
          <option value="">全ドメイン</option>
          {domains.map(([d, n]) => (
            <option key={d} value={d}>
              {d} ({n})
            </option>
          ))}
        </select>
        <label className="bm-toggle">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
          />
          非表示分
        </label>
        <span className="bm-spacer" />
        <button type="button" onClick={rescan} disabled={busy !== null}>
          {busy === 'scan' ? '走査中…' : '再スキャン'}
        </button>
        {untitled > 0 && (
          <button type="button" onClick={fetchMore} disabled={busy !== null}>
            {busy === 'fetch' ? '取得中…' : `タイトル取得(残り${untitled})`}
          </button>
        )}
      </div>
      {notice && <p className="studio-note">{notice}</p>}

      <div className="bm-list">
        {shown.map((r) => (
          <div key={r.url} className="bm-row">
            <div className="bm-main">
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="bm-title">
                {r.title ?? r.url}
              </a>
              <span className="bm-domain">{r.domain}</span>
            </div>
            {r.context && <p className="bm-context">{r.context}</p>}
            <div className="bm-meta">
              {r.sources.slice(0, 3).map((s) => (
                <Link key={s.href + s.date} href={s.href} className="bm-source">
                  {s.label}
                </Link>
              ))}
              {r.sources.length > 3 && <span>ほか{r.sources.length - 3}件</span>}
              <span className="bm-date">{r.lastSeen ? dateShort(r.lastSeen) : ''}</span>
              <span className="bm-spacer" />
              {r.fetched && !r.title && (
                <button type="button" onClick={() => post('refetch', { url: r.url }).then((j) => j && window.location.reload())} disabled={busy !== null}>
                  再取得
                </button>
              )}
              <button type="button" onClick={() => toggleHidden(r)} disabled={busy !== null}>
                {r.hidden ? '戻す' : '非表示'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {shown.length === 0 && (
        <p className="studio-note">
          {rows.length === 0
            ? 'まだ何もありません。「再スキャン」で本文からリンクを集めます'
            : '該当なし'}
        </p>
      )}
    </div>
  )
}
