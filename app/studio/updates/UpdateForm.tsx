'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// 手動Updates行の投稿フォーム。日付(既定=今日)+ラベル(種別列)+本文(タイトル列)+任意リンク
export default function UpdateForm({ defaultDate }: { defaultDate: string }) {
  const router = useRouter()
  const [date, setDate] = useState(defaultDate)
  const [label, setLabel] = useState('NEWS')
  const [body, setBody] = useState('')
  const [href, setHref] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || !body.trim()) return
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/manual-update', {
        method: 'POST',
        body: JSON.stringify({ date, label, body, href }),
      })
      if (!res.ok) throw new Error()
      setBody('')
      setHref('')
      setMessage('投稿しました')
      router.refresh()
    } catch {
      setMessage('投稿に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="update-post-form" onSubmit={submit}>
      <div className="update-post-row">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="日付"
          required
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="ラベル(例: NEWS)"
          aria-label="ラベル"
          maxLength={20}
          required
        />
      </div>
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="本文(Updatesのタイトル列に出る一文)"
        aria-label="本文"
        maxLength={300}
        required
      />
      <input
        value={href}
        onChange={(e) => setHref(e.target.value)}
        placeholder="リンク先(任意。/notes/… または https://…)"
        aria-label="リンク先"
      />
      <div className="update-post-actions">
        <button type="submit" className="bulk-btn" disabled={busy || !body.trim()}>
          投稿する
        </button>
        <span className="bulk-message">{message}</span>
      </div>
    </form>
  )
}
