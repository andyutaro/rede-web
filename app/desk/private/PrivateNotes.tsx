'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import HtmlEditor, { type HtmlEditorController } from '@/components/HtmlEditor'

// deskのprivate。タブを好きなだけ増やして、外に出ない文章を書く。
//
// **中継への配線を一切持たない**(HtmlEditorのonRawChangeを使わない)。
// 放送卓と同じ書き味・同じ画像アップロードのまま、流れる先だけが無い。
//
// 保存はdeskと同じ作法: 打鍵ごとにlocalStorageへ下書き → 1.2秒のデバウンスで
// サーバーへ。通信に失敗しても端末には残り、復帰時に送り直す
// (2026-08-16のテキスト消失で学んだことをそのまま持ち込む)。
type Note = { id: string; html: string; sort_order: number; updated_at: string }

const BG = '#1a1a1a'
const INK = '#e8e6e0'
const MUTED = '#6b6b6b'
const FONT = '-apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif'
const SAVE_DELAY = 1200

// タブの見出し=本文の1行目(スティッキーズと同じ作法)。空なら「無題」
function tabLabel(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/[⁠​-‍﻿]/g, '')
  const first = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0)
  if (!first) return '無題'
  return [...first].slice(0, 12).join('') + ([...first].length > 12 ? '…' : '')
}

export default function PrivateNotes({ initial }: { initial: Note[] }) {
  const [notes, setNotes] = useState<Note[]>(initial)
  const [activeId, setActiveId] = useState<string | null>(initial[0]?.id ?? null)
  const [status, setStatus] = useState('')
  const controllerRef = useRef<HtmlEditorController | null>(null)

  // 保存待ちの管理。activeIdはタブ切替で変わるので、保存対象はrefで固定する
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingId = useRef<string | null>(null)
  const pendingHtml = useRef<string>('')
  const dirty = useRef(false)

  const draftKey = (id: string) => `desk-private-${id}`

  const doSave = useCallback(async () => {
    const id = pendingId.current
    if (!id) return
    const html = pendingHtml.current
    try {
      const res = await fetch('/api/desk/private', {
        method: 'POST',
        body: JSON.stringify({ id, html }),
      })
      if (res.ok) {
        dirty.current = false
        try {
          localStorage.setItem(draftKey(id), JSON.stringify({ html, dirty: false, ts: Date.now() }))
        } catch {
          // localStorage不可なら諦める
        }
        setStatus('保存済み')
      } else {
        setStatus('保存失敗')
      }
    } catch {
      // 通信断。端末には残っているので復帰時に送り直す
      setStatus('オフライン(この端末には保存済み)')
    }
  }, [])

  // デバウンス待ちを今すぐ送り切る(タブ切替・離脱の前に必ず呼ぶ)
  const flush = useCallback(() => {
    if (!saveTimer.current) return
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    void doSave()
  }, [doSave])

  useEffect(() => {
    const onBeforeUnload = () => {
      if (!saveTimer.current || !pendingId.current) return
      clearTimeout(saveTimer.current)
      const body = JSON.stringify({ id: pendingId.current, html: pendingHtml.current })
      navigator.sendBeacon?.('/api/desk/private', new Blob([body], { type: 'application/json' }))
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    // 通信断からの復帰・保険の定期リトライ(deskと同じ)
    const retry = () => {
      if (dirty.current && !saveTimer.current) void doSave()
    }
    window.addEventListener('online', retry)
    const interval = setInterval(retry, 15 * 1000)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('online', retry)
      clearInterval(interval)
    }
  }, [doSave])

  function onEdit(html: string) {
    const id = activeId
    if (!id) return
    pendingId.current = id
    pendingHtml.current = html
    dirty.current = true
    // タブの見出しは1行目なので、打鍵に合わせて更新する
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, html } : n)))
    try {
      localStorage.setItem(draftKey(id), JSON.stringify({ html, dirty: true, ts: Date.now() }))
    } catch {
      // localStorage不可なら諦める
    }
    setStatus('・・・')
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      void doSave()
    }, SAVE_DELAY)
  }

  function switchTo(id: string) {
    if (id === activeId) return
    flush() // 切替前に書きかけを送り切る(数秒ぶんが落ちるのを防ぐ)
    setActiveId(id)
    const note = notes.find((n) => n.id === id)
    controllerRef.current?.setHtml(note?.html ?? '')
  }

  async function addNote() {
    flush()
    setStatus('新しいタブ…')
    try {
      const res = await fetch('/api/desk/private', { method: 'PUT' })
      if (!res.ok) {
        setStatus('作成に失敗しました')
        return
      }
      const { note } = (await res.json()) as { note: Note }
      setNotes((prev) => [...prev, note])
      setActiveId(note.id)
      controllerRef.current?.setHtml('')
      setStatus('')
    } catch {
      setStatus('通信に失敗しました')
    }
  }

  async function trashActive() {
    const id = activeId
    if (!id) return
    if (!confirm('このメモをゴミ箱へ移します。よろしいですか。')) return
    flush()
    try {
      await fetch('/api/desk/private', { method: 'DELETE', body: JSON.stringify({ id }) })
      const rest = notes.filter((n) => n.id !== id)
      setNotes(rest)
      const next = rest[0] ?? null
      setActiveId(next?.id ?? null)
      controllerRef.current?.setHtml(next?.html ?? '')
      setStatus('ゴミ箱へ移しました')
    } catch {
      setStatus('通信に失敗しました')
    }
  }

  const active = notes.find((n) => n.id === activeId) ?? null

  return (
    <main style={{ minHeight: '100vh', background: BG, color: INK, fontFamily: FONT }}>
      {/* 右上: 状態表示(放送卓と同じ位置・同じ調子) */}
      <div
        style={{
          position: 'fixed',
          top: 14,
          right: 18,
          fontSize: 11,
          color: MUTED,
          letterSpacing: '0.05em',
          userSelect: 'none',
          zIndex: 10,
        }}
      >
        {status}
      </div>

      {/* タブ帯 */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: BG,
          borderBottom: '1px solid rgba(232,230,224,0.14)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '12px 18px',
          overflowX: 'auto',
        }}
      >
        <span style={{ fontSize: 10, letterSpacing: '0.24em', color: MUTED, marginRight: 8, flex: 'none' }}>
          PRIVATE
        </span>
        {notes.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => switchTo(n.id)}
            style={{
              flex: 'none',
              background: n.id === activeId ? 'rgba(232,230,224,0.10)' : 'none',
              border: '1px solid rgba(232,230,224,0.20)',
              borderRadius: 999,
              color: n.id === activeId ? INK : MUTED,
              fontSize: 12,
              padding: '5px 13px',
              cursor: 'pointer',
              fontFamily: FONT,
              whiteSpace: 'nowrap',
            }}
          >
            {tabLabel(n.html)}
          </button>
        ))}
        <button
          type="button"
          onClick={addNote}
          title="新しいメモ"
          style={{
            flex: 'none',
            background: 'none',
            border: '1px solid rgba(232,230,224,0.20)',
            borderRadius: 999,
            color: MUTED,
            fontSize: 13,
            padding: '4px 12px',
            cursor: 'pointer',
            fontFamily: FONT,
          }}
        >
          ＋
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '38px 0 60vh' }}>
        <div style={{ width: '100%', maxWidth: 720, padding: '0 28px' }}>
          {active ? (
            <HtmlEditor
              key="private-surface"
              initialHtml={active.html}
              controllerRef={controllerRef}
              autoFocus
              keepCaretCentered
              minHeight="50vh"
              placeholder="ここに書く(外には出ません)"
              surfaceStyle={{ fontSize: 17, padding: 0 }}
              onChange={onEdit}
              onError={setStatus}
              menuActions={[
                { label: 'このメモをゴミ箱へ', onClick: trashActive },
                {
                  label: '放送卓(desk)へ戻る',
                  onClick: () => {
                    flush()
                    location.href = '/desk'
                  },
                },
              ]}
            />
          ) : (
            <p style={{ fontSize: 13, color: MUTED, lineHeight: 2 }}>
              メモがありません。右上の ＋ で新しいタブを作ってください。
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
