'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { todayInTokyo } from '@/lib/scribe/date'
import HtmlEditor, { type HtmlEditorController } from '@/components/HtmlEditor'

const SAVE_DELAY = 1500

type Props = {
  initialDate: string
  initialHtml: string
  initialUpdatedAt: string | null
}

// 放送卓。編集機能(contenteditable・アップロード・埋め込み・ブロックID)は
// 共有エディタコア(components/HtmlEditor)に委譲し(2026-07-10載せ替え)、
// ここには放送卓固有の関心だけが残る:
// ライブ配信(全量スナップショット)・自動保存+楽観ロック・オフライン下書き・
// 日付跨ぎ・他端末更新の取り込み。
export default function DeskEditor({ initialDate, initialHtml, initialUpdatedAt }: Props) {
  const [status, setStatus] = useState('')
  const controllerRef = useRef<HtmlEditorController | null>(null)
  // 保存パイプはrefで持つ(打鍵ごとのstate更新でエディタを再レンダーしない)
  const saveableHtmlRef = useRef(initialHtml)
  const rawHtmlRef = useRef(initialHtml)
  const onEditRef = useRef<() => void>(() => {})
  const onRawChangeRef = useRef<() => void>(() => {})

  useEffect(() => {
    const openedDate = initialDate
    // 楽観ロックの基点。「このタブが最後に読み込んだ/保存した時点のupdated_at」。
    // nullは「まだ行が存在しない前提で開いた」ことを意味する。
    let baseUpdatedAt: string | null = initialUpdatedAt
    let saveTimer: ReturnType<typeof setTimeout> | null = null
    // オフライン対応: dirty=クラウド未反映の編集がある / offlinePending=保存が
    // ネットワーク起因で失敗した(オフライン執筆中)。下書きは打鍵ごとにlocalStorageへ
    // 書くので、圏外でもタブ破棄でも失われない。
    let dirty = false
    let offlinePending = false
    // 最終打鍵時刻。「執筆中の端末のテキストを他端末の内容で消さない」ための基準
    // (2026-07-14消失バグ修正)。この時間内の端末は衝突時も自分を正とする
    let lastInputAt = 0
    const ACTIVE_TYPING_MS = 2 * 60 * 1000
    const DRAFT_KEY = `scribe-draft-${openedDate}`
    const RESCUE_KEY = `scribe-rescue-${openedDate}`

    function writeDraft() {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ html: saveableHtmlRef.current, dirty, ts: Date.now() })
        )
      } catch {
        // プライベートモード等でlocalStorage不可の場合は諦める(従来動作に落ちる)
      }
    }

    let liveSocket: WebSocket | null = null
    let liveConfig: { token: string; relay: string } | null = null
    let liveSeq = 0
    const sessionId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)

    // 他端末の内容でエディタを置き換える。呼び出し側が「この端末は執筆中でない」
    // ことを保証する(執筆中の置換はテキスト消失になる。2026-07-14修正)。
    // 万一に備え、置換前の内容が消える場合はRESCUE_KEYへ退避しておく(手動復旧用)。
    function applyRemote(latest: { html: string; updated_at: string | null } | null, message: string) {
      const html = latest?.html ?? ''
      const current = controllerRef.current?.getSaveableHtml() ?? saveableHtmlRef.current
      if (current && current !== html) {
        try {
          localStorage.setItem(RESCUE_KEY, JSON.stringify({ html: current, ts: Date.now() }))
        } catch {
          // localStorage不可なら退避なしで進む
        }
      }
      baseUpdatedAt = latest?.updated_at ?? null
      controllerRef.current?.setHtml(html)
      saveableHtmlRef.current = controllerRef.current?.getSaveableHtml() ?? html
      dirty = false
      writeDraft()
      setStatus(message)
    }

    async function doSave(dateOverride?: string, finalize?: boolean) {
      const date = dateOverride ?? openedDate
      const body = JSON.stringify({ date, html: saveableHtmlRef.current, finalize, baseUpdatedAt })
      try {
        const res = await fetch('/api/scribe/save', { method: 'POST', body })
        if (res.status === 409) {
          const { latest } = await res.json()
          if (offlinePending || Date.now() - lastInputAt < ACTIVE_TYPING_MS) {
            // オフライン執筆との衝突、またはこの端末でいま執筆中の衝突は、
            // 直近に身体が書いた方(この端末)を正とし、新しいbaseで書き込み直す。
            // 単独著者システムでは「執筆中の端末」が常に最新の意図(2026-07-14修正:
            // 従来は執筆中でもサーバー側で置換され、直前の入力が消えていた)
            baseUpdatedAt = latest?.updated_at ?? null
            offlinePending = false
            await doSave(dateOverride, finalize)
            return
          }
          // 放置タブの衝突: このタブの内容は古い土台の上にあるので、上書きせず最新を取り込む
          applyRemote(latest, '他の端末の更新を読み込みました(保存競合)')
          return
        }
        if (res.ok) {
          const data = await res.json()
          baseUpdatedAt = data.updatedAt
          dirty = false
          offlinePending = false
          writeDraft()
          setStatus('保存済み')
        } else {
          setStatus('保存失敗')
        }
      } catch {
        // ネットワーク断: 内容はlocalStorageに残っている。復帰時にretrySyncが送る
        offlinePending = true
        setStatus('オフライン(この端末には保存済み)')
      }
    }

    // オンライン復帰・定期リトライでクラウド未反映分を送る
    function retrySync() {
      if (dirty && !saveTimer) doSave()
    }

    // タブがフォアグラウンドに戻ったとき、未保存の編集がなければ最新を取り込む。
    // これで「別端末で書いたあと古いタブに戻る」ケースの衝突をそもそも起きにくくする。
    async function refreshIfIdle() {
      if (saveTimer || dirty) return // クラウド未反映の編集があるうちは触らない(オフライン執筆の保護)
      const startedAt = Date.now()
      try {
        const res = await fetch(`/api/scribe/load?date=${openedDate}`, { cache: 'no-store' })
        if (!res.ok) return
        const latest = await res.json()
        // fetch中(モバイルでは数秒かかる)に打鍵が始まっていたら適用しない。
        // ガードをfetch前にしか見ていなかったため、タブ復帰直後に書き始めた
        // テキストがサーバー内容で消える事故が起きていた(2026-07-14修正)
        if (saveTimer || dirty || lastInputAt >= startedAt) return
        if (latest.updatedAt && latest.updatedAt !== baseUpdatedAt) {
          applyRemote({ html: latest.html, updated_at: latest.updatedAt }, '他の端末の更新を読み込みました(復帰同期)')
        }
      } catch {
        // オフライン等は無視(次の保存時に楽観ロックが守る)
      }
    }

    function scheduleSave() {
      setStatus('・・・')
      if (saveTimer) clearTimeout(saveTimer)
      // 発火時にnullへ戻すこと。残ったIDを「保存待ちあり」と誤認すると
      // retrySync/refreshIfIdleが二度と動かなくなる
      saveTimer = setTimeout(() => {
        saveTimer = null
        doSave()
      }, SAVE_DELAY)
    }

    function broadcastLive() {
      if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) return
      liveSeq += 1
      liveSocket.send(JSON.stringify({ session: sessionId, seq: liveSeq, html: rawHtmlRef.current }))
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
        // 再接続時にこのタブの内容が古いまま放送してしまう事故を防ぐ:
        // 未保存の編集がなければ、まず最新を取り込んでから放送する。
        // (放置されたタブが中継の再起動時に古いスナップショットを流し、
        // /watchが巻き戻って見える問題への対策)
        refreshIfIdle().finally(() => broadcastLive())
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

    // 日付をまたいだら、直前の内容は「古い日」のものとして明示的にその日付で保存してからリロードする。
    // ただし執筆の真っ最中(2分以内に打鍵)はリロードを保留する(書いている画面が
    // 突然空になるのは消失事故と区別がつかない)。手が止まった次のチェックで実行
    function checkDateChange() {
      const current = todayInTokyo()
      if (current === openedDate) return
      if (Date.now() - lastInputAt < ACTIVE_TYPING_MS) {
        setStatus('日付が変わりました(手が止まったら翌日分に切り替えます)')
        return
      }
      const previousDate = openedDate
      if (saveTimer) clearTimeout(saveTimer)
      doSave(previousDate, true).finally(() => location.reload())
    }

    // HtmlEditorからの編集通知(onChangeで保存用HTMLを受け取った後に呼ばれる)
    onEditRef.current = () => {
      lastInputAt = Date.now()
      dirty = true
      writeDraft() // 打鍵ごとに端末へ下書き保存(圏外・タブ破棄への保険)
      scheduleSave()
    }
    // DOM変化ごとの生スナップショット通知(配信は旧実装同様デバウンスなし)
    onRawChangeRef.current = () => {
      broadcastLive()
    }

    // 未同期のオフライン下書きがあれば復元して即同期する
    // (圏外で書いた後にタブが破棄されても、開き直せばここで拾われる)
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (!k) continue
        // 置換退避(rescue)は7日で掃除(手動復旧の猶予を残しつつ無限に溜めない)
        if (k.startsWith('scribe-rescue-') && k !== RESCUE_KEY) {
          try {
            const r = JSON.parse(localStorage.getItem(k) ?? '{}')
            if (!r.ts || Date.now() - r.ts > 7 * 24 * 60 * 60 * 1000) localStorage.removeItem(k)
          } catch {
            localStorage.removeItem(k)
          }
          continue
        }
        if (!k.startsWith('scribe-draft-') || k === DRAFT_KEY) continue
        // 過去日の下書きは、同期済みのものだけ掃除する(未同期は救出用に残す)
        try {
          const old = JSON.parse(localStorage.getItem(k) ?? '{}')
          if (!old.dirty) localStorage.removeItem(k)
        } catch {
          localStorage.removeItem(k)
        }
      }
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const draft = JSON.parse(raw)
        if (draft.dirty && typeof draft.html === 'string') {
          controllerRef.current?.setHtml(draft.html)
          saveableHtmlRef.current = controllerRef.current?.getSaveableHtml() ?? draft.html
          dirty = true
          offlinePending = true // サーバー側と食い違っていてもこの下書きを正とする
          doSave()
        }
      }
    } catch {
      // localStorage不可の環境では復元なしで進む
    }

    connectLive()

    function onBeforeUnload() {
      if (!saveTimer) return
      clearTimeout(saveTimer)
      // デバウンス待ちの最新内容をDOMから直接取る(refよりさらに新しい可能性がある)
      const html = controllerRef.current?.getSaveableHtml() ?? saveableHtmlRef.current
      const body = JSON.stringify({ date: openedDate, html, baseUpdatedAt })
      navigator.sendBeacon?.('/api/scribe/save', new Blob([body], { type: 'application/json' }))
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    const dateInterval = setInterval(checkDateChange, 60 * 1000)
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        checkDateChange()
        refreshIfIdle()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    // Macでウィンドウを切り替えて戻った場合など、visibilitychangeが発火しない復帰も拾う
    window.addEventListener('focus', refreshIfIdle)
    // 圏外→復帰の自動同期。onlineイベントに加え、イベントが飛ばない環境の保険として定期リトライ
    window.addEventListener('online', retrySync)
    const retryInterval = setInterval(retrySync, 15 * 1000)

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', refreshIfIdle)
      window.removeEventListener('online', retrySync)
      clearInterval(retryInterval)
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
        <div style={{ width: '100%', maxWidth: 720, padding: '0 28px' }}>
          <HtmlEditor
            initialHtml={initialHtml}
            controllerRef={controllerRef}
            autoFocus
            keepCaretCentered
            minHeight="40vh"
            surfaceStyle={{ fontSize: 18, padding: 0 }}
            onChange={(html) => {
              saveableHtmlRef.current = html
              onEditRef.current()
            }}
            onRawChange={(raw) => {
              rawHtmlRef.current = raw
              onRawChangeRef.current()
            }}
            onError={setStatus}
          />
        </div>
      </div>
    </main>
  )
}
