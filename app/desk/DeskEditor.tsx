'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { todayInTokyo } from '@/lib/scribe/date'

const SAVE_DELAY = 1500

type Props = {
  initialDate: string
  initialHtml: string
}

export default function DeskEditor({ initialDate, initialHtml }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    // 副作用を伴う初期化はすべてeffect内で行う(render中に副作用関数を呼ばない)。
    // connectLiveのような自己再帰の再接続ループはfunction宣言にする
    // (hoistされるため、宣言前の自己参照でもTDZエラーにならない)。
    const openedDate = initialDate
    let saveTimer: ReturnType<typeof setTimeout> | null = null
    let liveSocket: WebSocket | null = null
    let liveConfig: { token: string; relay: string } | null = null
    let liveSeq = 0
    const sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)

    // 段落(トップレベルdiv)生成時にdata-block-idを焼き込む。既存IDは上書きしない。
    function assignBlockIds() {
      for (const child of Array.from(editor!.children)) {
        if (!child.hasAttribute('data-block-id')) {
          child.setAttribute('data-block-id', crypto.randomUUID())
        }
      }
    }

    async function doSave(dateOverride?: string, finalize?: boolean) {
      const date = dateOverride ?? openedDate
      const body = JSON.stringify({ date, html: editor!.innerHTML, finalize })
      try {
        const res = await fetch('/api/scribe/save', { method: 'POST', body })
        setStatus(res.ok ? '保存済み' : '保存失敗')
      } catch {
        setStatus('オフライン')
      }
    }

    function scheduleSave() {
      setStatus('・・・')
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => doSave(), SAVE_DELAY)
    }

    function broadcastLive() {
      if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) return
      liveSeq += 1
      liveSocket.send(JSON.stringify({ session: sessionId, seq: liveSeq, html: editor!.innerHTML }))
    }

    function connectLive() {
      if (!liveConfig) {
        fetch('/api/scribe/live', { cache: 'no-store' })
          .then((res) => {
            if (!res.ok) throw new Error('unauthorized')
            return res.json()
          })
          .then((cfg) => {
            liveConfig = cfg
            connectLive()
          })
          .catch(() => {
            setTimeout(connectLive, 2000)
          })
        return
      }
      const ws = new WebSocket(`${liveConfig.relay}/ws/pub?token=${encodeURIComponent(liveConfig.token)}`)
      ws.addEventListener('open', () => {
        liveSocket = ws
        broadcastLive()
      })
      ws.addEventListener('close', () => {
        liveSocket = null
        setTimeout(connectLive, 2000)
      })
      ws.addEventListener('error', () => {
        try {
          ws.close()
        } catch {
          // no-op
        }
      })
    }

    // 日付をまたいだら、直前の内容は「古い日」のものとして明示的にその日付で保存してからリロードする
    function checkDateChange() {
      const current = todayInTokyo()
      if (current === openedDate) return
      const previousDate = openedDate
      if (saveTimer) clearTimeout(saveTimer)
      doSave(previousDate, true).finally(() => location.reload())
    }

    function placeCaretAtEnd() {
      editor!.focus()
      const range = document.createRange()
      range.selectNodeContents(editor!)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
    }

    // カーソルが画面下55%より下に来たら、40%あたりまで能動的にスクロールする
    function keepCaretCentered() {
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount) return
      const range = sel.getRangeAt(0).cloneRange()
      range.collapse(true)
      const rect = range.getClientRects()[0]
      if (!rect) return
      const viewportHeight = window.innerHeight
      const threshold = viewportHeight * 0.55
      if (rect.top > threshold) {
        window.scrollBy({ top: rect.top - viewportHeight * 0.4 })
      }
    }

    editor.innerHTML = initialHtml
    assignBlockIds()
    placeCaretAtEnd()
    connectLive()

    function onInput() {
      scheduleSave()
      keepCaretCentered()
    }
    editor.addEventListener('input', onInput)

    const observer = new MutationObserver(() => {
      assignBlockIds()
      broadcastLive()
    })
    observer.observe(editor, { childList: true, characterData: true, subtree: true })

    function onBeforeUnload() {
      if (!saveTimer) return
      clearTimeout(saveTimer)
      const body = JSON.stringify({ date: openedDate, html: editor!.innerHTML })
      navigator.sendBeacon?.('/api/scribe/save', new Blob([body], { type: 'application/json' }))
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    const dateInterval = setInterval(checkDateChange, 60 * 1000)
    function onVisibility() {
      if (document.visibilityState === 'visible') checkDateChange()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      editor.removeEventListener('input', onInput)
      observer.disconnect()
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(dateInterval)
      if (saveTimer) clearTimeout(saveTimer)
      liveSocket?.close()
    }
    // マウント時に一度だけ実行(initialDate/initialHtmlは初回描画専用の値として使う)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    location.href = '/login'
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#1a1a1a',
        color: '#e8e6e0',
        fontFamily: '-apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif',
      }}
    >
      <div
        style={{
          position: 'fixed',
          top: 14,
          right: 18,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontSize: 11,
          color: '#6b6b6b',
          letterSpacing: '0.05em',
          userSelect: 'none',
          zIndex: 10,
        }}
      >
        <span>{status}</span>
        <button
          onClick={handleLogout}
          style={{
            background: 'none',
            border: 'none',
            color: '#6b6b6b',
            fontSize: 11,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          ログアウト
        </button>
      </div>
      <div
        style={{
          minHeight: '100%',
          padding: '64px 0 70vh 0',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="ここに書く"
          style={{
            width: '100%',
            maxWidth: 720,
            minHeight: '40vh',
            padding: '0 28px',
            fontSize: 18,
            lineHeight: 1.9,
            color: '#e8e6e0',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            caretColor: '#e8e6e0',
          }}
        />
      </div>
    </main>
  )
}
