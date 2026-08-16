'use client'

import Link from 'next/link'
import { useState, useSyncExternalStore } from 'react'

// 端末に残っている下書き(scribe-draft-*)と置換退避(scribe-rescue-*)を一覧する。
// **この画面は何も消さない**(deskの起動時掃除と違い、古い鍵もそのまま残す)。
// 書き戻しは「この内容でサーバーを上書き」を押したときだけ。
//
// 配色はdesk本体と同じ(地#1a1a1a・文字#e8e6e0)。deskの<main>の外にある別ルート
// なので色を継承できず、初版は白地に白文字で読めなかった(2026-08-16 Andy指摘)。
const BG = '#1a1a1a'
const INK = '#e8e6e0'
const MUTED = '#6b6b6b'
const FONT = '-apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif'

type Entry = {
  key: string
  date: string
  kind: '下書き' | '置換退避' | '他端末の本文'
  html: string
  chars: number
  ts: number | null
  dirty: boolean | null
}

// 鍵の形: scribe-draft-<日付> / scribe-rescue-<日付> / scribe-rescue-<日付>-remote
// (-remote = この端末が上書きしたときに退避した、他端末側の本文)
const KEY_RE = /^scribe-(draft|rescue)-(\d{4}-\d{2}-\d{2})(-remote)?$/

function plainChars(html: string): number {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s/g, '').length
}

const btn: React.CSSProperties = {
  background: 'none',
  border: `1px solid rgba(232,230,224,0.28)`,
  borderRadius: 999,
  color: INK,
  fontSize: 12,
  padding: '6px 14px',
  cursor: 'pointer',
  fontFamily: FONT,
}

// localStorageの読み取りは1回きり(この画面は書き換えないので変化しない)。
// useSyncExternalStoreに渡すため、同じ配列を返し続ける必要がある=モジュールに持つ
let cached: Entry[] | null = null

function readEntries(): Entry[] {
  if (cached) return cached
  const out: Entry[] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      const m = k.match(KEY_RE)
      if (!m) continue
      try {
        const v = JSON.parse(localStorage.getItem(k) ?? '{}')
        const html = typeof v.html === 'string' ? v.html : ''
        out.push({
          key: k,
          date: m[2],
          kind: m[3] ? '他端末の本文' : m[1] === 'draft' ? '下書き' : '置換退避',
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
  cached = out
  return out
}

const noSubscribe = () => () => {}

export default function RescueList() {
  // 端末のlocalStorage=Reactの外の系。サーバー側は空(null)を返して読み込み中を出す
  const entries = useSyncExternalStore<Entry[] | null>(noSubscribe, readEntries, () => null)
  const [open, setOpen] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  async function restore(e: Entry) {
    if (!confirm(`${e.date} のサーバー側の本文を、この内容(${e.chars}字)で上書きします。よろしいですか。`))
      return
    setMsg('保存中…')
    try {
      // 現在のサーバー内容を土台にして書く(楽観ロックを通す)
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

  return (
    <main style={{ minHeight: '100vh', background: BG, color: INK, fontFamily: FONT }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px 30vh', lineHeight: 1.9 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
          <h1 style={{ fontSize: 12, letterSpacing: '0.22em', fontWeight: 400, color: MUTED, margin: 0 }}>
            DESK — 端末に残っている本文
          </h1>
          <Link href="/desk" style={{ fontSize: 11, color: MUTED, letterSpacing: '0.05em' }}>
            ← desk
          </Link>
        </div>
        <p style={{ fontSize: 12, color: MUTED, margin: '18px 0 34px' }}>
          この画面は何も消しません。読むだけです。書き戻すときだけボタンを押してください。
        </p>

        {entries === null && <p style={{ fontSize: 13, color: MUTED }}>読み込み中…</p>}
        {entries?.length === 0 && (
          <p style={{ fontSize: 13, color: MUTED }}>この端末には下書きが残っていません。</p>
        )}

        {entries?.map((e) => (
          <div key={e.key} style={{ borderTop: '1px solid rgba(232,230,224,0.14)', padding: '18px 0' }}>
            <div style={{ fontSize: 13 }}>
              <span style={{ letterSpacing: '0.06em' }}>{e.date}</span>
              <span style={{ color: MUTED, marginLeft: 14 }}>{e.kind}</span>
              <span style={{ color: MUTED, marginLeft: 14 }}>{e.chars}字</span>
              {e.dirty === true && <span style={{ color: MUTED, marginLeft: 14 }}>未同期</span>}
              {e.ts && (
                <span style={{ color: MUTED, marginLeft: 14 }}>
                  {new Date(e.ts).toLocaleString('ja-JP')}
                </span>
              )}
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" style={btn} onClick={() => setOpen(open === e.key ? null : e.key)}>
                {open === e.key ? '閉じる' : '中身を見る'}
              </button>
              <button type="button" style={btn} onClick={() => navigator.clipboard?.writeText(e.html)}>
                HTMLをコピー
              </button>
              <button type="button" style={btn} onClick={() => restore(e)}>
                この内容でサーバーを上書き
              </button>
            </div>
            {open === e.key && (
              <div
                style={{
                  marginTop: 14,
                  padding: '14px 16px',
                  border: '1px solid rgba(232,230,224,0.14)',
                  borderRadius: 4,
                  color: INK,
                  fontSize: 14,
                  lineHeight: 2,
                  maxHeight: '52vh',
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

        {msg && <p style={{ marginTop: 24, fontSize: 13 }}>{msg}</p>}
      </div>
    </main>
  )
}
