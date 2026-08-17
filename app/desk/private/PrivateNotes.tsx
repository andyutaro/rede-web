'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import HtmlEditor, { type HtmlEditorController } from '@/components/HtmlEditor'
import DeskSwitch from '../DeskSwitch'

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

  // ドラッグで並び替える(サイドバーのみ)。sort_orderはdoubleなので、
  // 落とした位置の前後の中間値を入れれば全体を振り直さずに1枚だけ動かせる
  const dragId = useRef<string | null>(null)

  async function dropOn(targetId: string) {
    const from = dragId.current
    dragId.current = null
    if (!from || from === targetId) return
    const list = notes.filter((n) => n.id !== from)
    const at = list.findIndex((n) => n.id === targetId)
    if (at < 0) return
    const before = list[at - 1]?.sort_order
    const after = list[at].sort_order
    // 先頭へ落としたら「最初の値-1」、それ以外は前後の中間
    const next = before === undefined ? after - 1 : (before + after) / 2
    setNotes(
      [...notes.map((n) => (n.id === from ? { ...n, sort_order: next } : n))].sort(
        (a, b) => a.sort_order - b.sort_order
      )
    )
    try {
      await fetch('/api/desk/private', {
        method: 'PATCH',
        body: JSON.stringify({ id: from, sortOrder: next }),
      })
    } catch {
      setStatus('並び替えを保存できませんでした')
    }
  }

  const active = notes.find((n) => n.id === activeId) ?? null

  const listItems = notes.map((n) => ({ id: n.id, label: tabLabel(n.html) }))

  return (
    <main className="pv-root" style={{ minHeight: '100vh', background: BG, color: INK, fontFamily: FONT }}>
      {/* 幅で形を変える(2026-08-16 Andy相談): 広い画面は左サイドバーに縦一列
          (枚数が増えても探せる・タイトルが切れない・縦ドラッグで並び替えられる)。
          狭い画面は従来の横帯のまま=スマホに固定の柱を立てて本文幅を削らない */}
      <style>{`
        .pv-side { display: none; }
        .pv-tabs { display: flex; }
        .pv-main { padding: 38px 0 60vh; }
        @media (min-width: 900px) {
          .pv-side { display: flex; }
          .pv-tabs { display: none; }
          .pv-main { padding: 38px 0 60vh; margin-left: 232px; }
        }
        .pv-item.drag-over { border-color: rgba(232,230,224,0.55); }
      `}</style>

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

      {/* 左サイドバー(広い画面) */}
      <div
        className="pv-side"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 232,
          flexDirection: 'column',
          gap: 4,
          padding: '14px 12px',
          borderRight: '1px solid rgba(232,230,224,0.14)',
          background: BG,
          overflowY: 'auto',
          zIndex: 5,
        }}
      >
        <div style={{ marginBottom: 10 }}>
          <DeskSwitch current="private" onLeave={flush} />
        </div>
        {listItems.map((it) => (
          <button
            key={it.id}
            type="button"
            className="pv-item"
            draggable
            onDragStart={() => {
              dragId.current = it.id
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.currentTarget.classList.add('drag-over')
            }}
            onDragLeave={(e) => e.currentTarget.classList.remove('drag-over')}
            onDrop={(e) => {
              e.preventDefault()
              e.currentTarget.classList.remove('drag-over')
              void dropOn(it.id)
            }}
            onClick={() => switchTo(it.id)}
            style={{
              textAlign: 'left',
              background: it.id === activeId ? 'rgba(232,230,224,0.10)' : 'none',
              border: '1px solid transparent',
              borderRadius: 6,
              color: it.id === activeId ? INK : MUTED,
              fontSize: 12.5,
              lineHeight: 1.7,
              padding: '7px 10px',
              cursor: 'pointer',
              fontFamily: FONT,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {it.label}
          </button>
        ))}
        <button
          type="button"
          onClick={addNote}
          title="新しいメモ"
          style={{
            marginTop: 6,
            textAlign: 'left',
            background: 'none',
            border: '1px dashed rgba(232,230,224,0.22)',
            borderRadius: 6,
            color: MUTED,
            fontSize: 12.5,
            padding: '7px 10px',
            cursor: 'pointer',
            fontFamily: FONT,
          }}
        >
          ＋ 新しいメモ
        </button>
      </div>

      {/* 横帯(狭い画面) */}
      <div
        className="pv-tabs"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 5,
          background: BG,
          borderBottom: '1px solid rgba(232,230,224,0.14)',
          alignItems: 'center',
          gap: 6,
          padding: '12px 18px',
          overflowX: 'auto',
        }}
      >
        <span style={{ flex: 'none', marginRight: 4 }}>
          <DeskSwitch current="private" onLeave={flush} />
        </span>
        {listItems.map((it) => (
          <button
            key={it.id}
            type="button"
            onClick={() => switchTo(it.id)}
            style={{
              flex: 'none',
              background: it.id === activeId ? 'rgba(232,230,224,0.10)' : 'none',
              border: '1px solid rgba(232,230,224,0.20)',
              borderRadius: 999,
              color: it.id === activeId ? INK : MUTED,
              fontSize: 12,
              padding: '5px 13px',
              cursor: 'pointer',
              fontFamily: FONT,
              whiteSpace: 'nowrap',
            }}
          >
            {it.label}
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

      <div className="pv-main" style={{ display: 'flex', justifyContent: 'center' }}>
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
              menuActions={[{ label: 'このメモをゴミ箱へ', onClick: trashActive }]}
            />
          ) : (
            <p style={{ fontSize: 13, color: MUTED, lineHeight: 2 }}>
              メモがありません。＋ で新しいタブを作ってください。
            </p>
          )}
        </div>
      </div>
    </main>
  )
}
