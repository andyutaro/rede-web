'use client'

import { useEffect, useState } from 'react'

// 端末に残っている下書き(scribe-draft-*)と置換退避(scribe-rescue-*)を一覧する。
// **この画面は何も消さない**(deskの起動時掃除と違い、古い鍵もそのまま残す)。
// 書き戻しは「この内容でサーバーを上書き」を押したときだけ。
type Entry = {
  key: string
  date: string
  kind: '下書き' | '置換退避'
  html: string
  chars: number
  ts: number | null
  dirty: boolean | null
}

function plainChars(html: string): number {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s/g, '').length
}

export default function RescueList() {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const out: Entry[] = []
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (!k) continue
        const isDraft = k.startsWith('scribe-draft-')
        const isRescue = k.startsWith('scribe-rescue-')
        if (!isDraft && !isRescue) continue
        try {
          const v = JSON.parse(localStorage.getItem(k) ?? '{}')
          const html = typeof v.html === 'string' ? v.html : ''
          out.push({
            key: k,
            date: k.replace(/^scribe-(draft|rescue)-/, ''),
            kind: isDraft ? '下書き' : '置換退避',
            html,
            chars: plainChars(html),
            ts: typeof v.ts === 'number' ? v.ts : null,
            dirty: typeof v.dirty === 'boolean' ? v.dirty : null,
          })
        } catch {
          // 壊れた値は飛ばす(消さない)
        }
      }
    } catch {
      // localStorage不可(プライベートモード等)
    }
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.kind < b.kind ? -1 : 1))
    setEntries(out)
  }, [])

  async function restore(e: Entry) {
    if (!confirm(`${e.date} のサーバー側の本文を、この内容(${e.chars}字)で上書きします。よろしいですか。`)) return
    setMsg('保存中…')
    try {
      // 先に現在のサーバー内容を読み、その版を土台にして書く(楽観ロックを通す)
      const cur = await fetch(`/api/scribe/load?date=${e.date}`).then((r) => (r.ok ? r.json() : null))
      const res = await fetch('/api/scribe/save', {
        method: 'POST',
        body: JSON.stringify({ date: e.date, html: e.html, baseUpdatedAt: cur?.updatedAt ?? null }),
      })
      setMsg(res.ok ? '書き戻しました。deskを開き直してください。' : `失敗しました(${res.status})`)
    } catch {
      setMsg('通信に失敗しました')
    }
  }

  if (!entries) return <div style={{ padding: 24 }}>読み込み中…</div>

  return (
    <div style={{ padding: '24px 20px', maxWidth: 720, margin: '0 auto', lineHeight: 1.9 }}>
      <h1 style={{ fontSize: 15, letterSpacing: '0.2em', marginBottom: 6 }}>DESK — 端末に残っている本文</h1>
      <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 24 }}>
        この画面は何も消しません。読むだけです。書き戻すときだけボタンを押してください。
      </p>
      {entries.length === 0 && <p style={{ fontSize: 13 }}>この端末には下書きが残っていません。</p>}
      {entries.map((e) => (
        <div key={e.key} style={{ borderTop: '1px solid rgba(128,128,128,0.3)', padding: '14px 0' }}>
          <div style={{ fontSize: 13 }}>
            <strong>{e.date}</strong>　{e.kind}　{e.chars}字
            {e.dirty === true && '　未同期'}
            {e.ts && `　${new Date(e.ts).toLocaleString('ja-JP')}`}
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setOpen(open === e.key ? null : e.key)}>
              {open === e.key ? '閉じる' : '中身を見る'}
            </button>
            <button type="button" onClick={() => navigator.clipboard?.writeText(e.html)}>
              HTMLをコピー
            </button>
            <button type="button" onClick={() => restore(e)}>
              この内容でサーバーを上書き
            </button>
          </div>
          {open === e.key && (
            <div
              style={{
                marginTop: 10,
                padding: 12,
                border: '1px solid rgba(128,128,128,0.3)',
                borderRadius: 4,
                fontSize: 13,
                maxHeight: '50vh',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {e.html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')}
            </div>
          )}
        </div>
      ))}
      {msg && <p style={{ marginTop: 20, fontSize: 13 }}>{msg}</p>}
    </div>
  )
}
