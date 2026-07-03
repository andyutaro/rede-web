'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { todayInTokyo } from '@/lib/scribe/date'
import { embedConfigFor, isBareUrl } from '@/lib/scribe/embed'

const SAVE_DELAY = 1500

// 埋め込み要素(画像/PDF/ポッドキャストカード)のスタイル。クラス名は旧scribeおよび
// /watchサニタイザのホワイトリストと一致させている
const EMBED_CSS = `
.embed-image { display: block; max-width: 100%; border-radius: 6px; margin: 14px 0; cursor: pointer; }
.embed-pdf { display: flex; align-items: center; gap: 10px; padding: 10px 14px; margin: 10px 0;
  background: rgba(255,255,255,0.04); border-radius: 8px; color: #e8e6e0; text-decoration: none;
  width: fit-content; font-size: 14px; cursor: pointer; }
.embed-podcast { display: block; margin: 14px 0; border-radius: 10px; cursor: pointer;
  overflow: hidden; background: rgba(255,255,255,0.03); }
.embed-podcast iframe { display: block; border: none; width: 100%; }
.embed-selected { outline: 2px solid #7fb0e0; outline-offset: 3px; border-radius: 6px; }
a.plain-link { color: #7fb0e0; text-decoration: underline; word-break: break-all; }
`

type Props = {
  initialDate: string
  initialHtml: string
  initialUpdatedAt: string | null
}

export default function DeskEditor({ initialDate, initialHtml, initialUpdatedAt }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState('')
  // 埋め込み選択中はモバイル用の削除チップを出す(Backspaceが使えない環境への配慮)
  const [embedSelected, setEmbedSelected] = useState(false)
  const uploadFilesRef = useRef<(files: FileList | File[]) => void>(() => {})
  const deleteEmbedRef = useRef<() => void>(() => {})

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    // 副作用を伴う初期化はすべてeffect内で行う(render中に副作用関数を呼ばない)。
    // connectLiveのような自己再帰の再接続ループはfunction宣言にする
    // (hoistされるため、宣言前の自己参照でもTDZエラーにならない)。
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
    const DRAFT_KEY = `scribe-draft-${openedDate}`

    // 保存用HTML: 画面上の選択表示(embed-selected)を混ぜない
    function saveableHtml() {
      const clone = editor!.cloneNode(true) as HTMLElement
      clone.querySelectorAll('.embed-selected').forEach((el) => el.classList.remove('embed-selected'))
      return clone.innerHTML
    }

    function writeDraft() {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({ html: saveableHtml(), dirty, ts: Date.now() }))
      } catch {
        // プライベートモード等でlocalStorage不可の場合は諦める(従来動作に落ちる)
      }
    }
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

    // 他端末の内容でエディタを置き換える。置き換え直前の未保存キーストロークは
    // 失われるが、「文書全体を古い内容で上書きする」事故に比べれば損失は最小。
    function applyRemote(latest: { html: string; updated_at: string | null } | null, message: string) {
      setSelectedEmbed(null) // DOMを差し替えるので選択状態を破棄
      baseUpdatedAt = latest?.updated_at ?? null
      editor!.innerHTML = latest?.html ?? ''
      assignBlockIds()
      placeCaretAtEnd()
      dirty = false
      writeDraft()
      setStatus(message)
    }

    async function doSave(dateOverride?: string, finalize?: boolean) {
      const date = dateOverride ?? openedDate
      const body = JSON.stringify({ date, html: saveableHtml(), finalize, baseUpdatedAt })
      try {
        const res = await fetch('/api/scribe/save', { method: 'POST', body })
        if (res.status === 409) {
          const { latest } = await res.json()
          if (offlinePending) {
            // オフライン中の執筆と他端末の保存が衝突した場合は、直近に身体が
            // 書いた方(この端末)を正とし、新しいbaseで自分の内容を書き込み直す
            baseUpdatedAt = latest?.updated_at ?? null
            offlinePending = false
            await doSave(dateOverride, finalize)
            return
          }
          // 通常の衝突: このタブの内容は古い土台の上にあるので、上書きせず最新を取り込む
          applyRemote(latest, '他の端末の更新を読み込みました')
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

    // ---- 画像・PDF・埋め込みカード(旧scribeから移植) ----
    const supabaseStorage = createClient()

    // 挿入・削除系はinputイベントが発火しないため、保存系を手動で回す
    function markEdited() {
      dirty = true
      writeDraft()
      scheduleSave()
    }

    function insertNodeAtCaret(node: Node) {
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount || !editor!.contains(sel.anchorNode)) {
        editor!.appendChild(node)
        return
      }
      const range = sel.getRangeAt(0)
      range.deleteContents()
      range.insertNode(node)
      range.setStartAfter(node)
      range.collapse(true)
      sel.removeAllRanges()
      sel.addRange(range)
    }

    // スマホ写真は5〜10MBあるため、表示用途に十分な大きさへ縮小してから上げる
    // (Supabase無料枠1GBの節約と森の回線への配慮)。gif(アニメ保持)とHEICはそのまま
    async function downscaleImage(file: File): Promise<Blob> {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file
      try {
        const bmp = await createImageBitmap(file)
        const MAX = 2000
        const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height))
        if (scale >= 1 && file.size < 1.5 * 1024 * 1024) return file
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(bmp.width * scale)
        canvas.height = Math.round(bmp.height * scale)
        canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
        return blob && blob.size < file.size ? blob : file
      } catch {
        return file
      }
    }

    async function uploadFile(file: File) {
      const isImage = file.type.startsWith('image/')
      const isPdf = file.type === 'application/pdf'
      if (!isImage && !isPdf) return
      setStatus('アップロード中…')
      try {
        const blob = isImage ? await downscaleImage(file) : file
        const origExt = (file.name.split('.').pop() || (isPdf ? 'pdf' : 'png')).toLowerCase()
        const ext = blob === file ? origExt : 'jpg'
        const res = await fetch('/api/scribe/upload-url', { method: 'POST', body: JSON.stringify({ ext }) })
        if (!res.ok) throw new Error('upload-url failed')
        const { path, token, publicUrl } = await res.json()
        const { error } = await supabaseStorage.storage
          .from('scribe-media')
          .uploadToSignedUrl(path, token, blob, { contentType: blob.type || file.type })
        if (error) throw error

        let node: HTMLElement
        if (isImage) {
          const img = document.createElement('img')
          img.className = 'embed-image'
          img.src = publicUrl
          node = img
        } else {
          const a = document.createElement('a')
          a.className = 'embed-pdf'
          a.href = publicUrl
          a.target = '_blank'
          a.rel = 'noopener noreferrer'
          a.textContent = '📄 ' + file.name
          node = a
        }
        node.contentEditable = 'false'
        insertNodeAtCaret(node)
        insertNodeAtCaret(document.createElement('br'))
        markEdited()
      } catch {
        setStatus('アップロード失敗')
      }
    }

    function uploadFiles(files: FileList | File[]) {
      for (const f of Array.from(files)) uploadFile(f)
    }
    uploadFilesRef.current = uploadFiles

    // ペースト: 画像ファイル(Gboardのクリップボード等) or 単体URL(カード化/リンク化)。
    // それ以外は通常のペーストに任せる(inputイベント経由で保存される)
    function onPaste(e: ClipboardEvent) {
      const files = e.clipboardData?.files
      if (files && files.length > 0) {
        e.preventDefault()
        uploadFiles(files)
        return
      }
      const text = e.clipboardData?.getData('text') ?? ''
      if (!isBareUrl(text)) return
      e.preventDefault()
      const url = text.trim()
      const cfg = embedConfigFor(url)
      if (cfg) {
        const wrap = document.createElement('div')
        wrap.className = 'embed-podcast'
        wrap.contentEditable = 'false'
        const iframe = document.createElement('iframe')
        iframe.src = cfg.src
        iframe.height = String(cfg.height)
        iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture')
        iframe.setAttribute('loading', 'lazy')
        wrap.appendChild(iframe)
        insertNodeAtCaret(wrap)
      } else {
        const a = document.createElement('a')
        a.href = url
        a.textContent = url
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.className = 'plain-link'
        insertNodeAtCaret(a)
      }
      insertNodeAtCaret(document.createElement('br'))
      markEdited()
    }

    function onDragOver(e: DragEvent) {
      e.preventDefault()
    }
    function onDrop(e: DragEvent) {
      e.preventDefault()
      if (e.dataTransfer?.files) uploadFiles(e.dataTransfer.files)
    }

    // 埋め込みの選択と削除: contenteditable=falseの島は通常のテキスト削除ができないため、
    // クリック選択 -> Backspace/Delete、またはモバイル用の削除チップで消す
    let selectedEmbed: HTMLElement | null = null
    function setSelectedEmbed(el: HTMLElement | null) {
      if (selectedEmbed && selectedEmbed !== el) selectedEmbed.classList.remove('embed-selected')
      selectedEmbed = el
      if (el) el.classList.add('embed-selected')
      setEmbedSelected(!!el)
    }
    deleteEmbedRef.current = () => {
      if (!selectedEmbed) return
      selectedEmbed.remove()
      setSelectedEmbed(null)
      markEdited()
    }
    function onEditorClick(e: MouseEvent) {
      const embed = (e.target as HTMLElement).closest?.('.embed-image, .embed-pdf, .embed-podcast') as HTMLElement | null
      if (embed) {
        if (embed.classList.contains('embed-pdf')) e.preventDefault() // シングルクリックは選択のみ
        setSelectedEmbed(embed)
      } else {
        setSelectedEmbed(null)
      }
    }
    function onEditorDblClick(e: MouseEvent) {
      const pdf = (e.target as HTMLElement).closest?.('.embed-pdf') as HTMLAnchorElement | null
      if (pdf) window.open(pdf.href, '_blank')
    }
    function onEditorKeydown(e: KeyboardEvent) {
      if (selectedEmbed && (e.key === 'Backspace' || e.key === 'Delete')) {
        e.preventDefault()
        deleteEmbedRef.current()
      }
    }
    function onDocumentClick(e: MouseEvent) {
      if (!editor!.contains(e.target as Node)) setSelectedEmbed(null)
    }

    // タブがフォアグラウンドに戻ったとき、未保存の編集がなければ最新を取り込む。
    // これで「別端末で書いたあと古いタブに戻る」ケースの衝突をそもそも起きにくくする。
    async function refreshIfIdle() {
      if (saveTimer || dirty) return // クラウド未反映の編集があるうちは触らない(オフライン執筆の保護)
      try {
        const res = await fetch(`/api/scribe/load?date=${openedDate}`, { cache: 'no-store' })
        if (!res.ok) return
        const latest = await res.json()
        if (latest.updatedAt && latest.updatedAt !== baseUpdatedAt) {
          applyRemote({ html: latest.html, updated_at: latest.updatedAt }, '他の端末の更新を読み込みました')
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

    // 未同期のオフライン下書きがあれば復元して即同期する
    // (圏外で書いた後にタブが破棄されても、開き直せばここで拾われる)
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i)
        if (!k || !k.startsWith('scribe-draft-') || k === DRAFT_KEY) continue
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
          editor.innerHTML = draft.html
          assignBlockIds()
          dirty = true
          offlinePending = true // サーバー側と食い違っていてもこの下書きを正とする
          doSave()
        }
      }
    } catch {
      // localStorage不可の環境では復元なしで進む
    }

    placeCaretAtEnd()
    connectLive()

    function onInput() {
      dirty = true
      writeDraft() // 打鍵ごとに端末へ下書き保存(圏外・タブ破棄への保険)
      scheduleSave()
      keepCaretCentered()
    }
    editor.addEventListener('input', onInput)
    editor.addEventListener('paste', onPaste)
    editor.addEventListener('dragover', onDragOver)
    editor.addEventListener('drop', onDrop)
    editor.addEventListener('click', onEditorClick)
    editor.addEventListener('dblclick', onEditorDblClick)
    editor.addEventListener('keydown', onEditorKeydown)
    document.addEventListener('click', onDocumentClick)

    const observer = new MutationObserver(() => {
      assignBlockIds()
      broadcastLive()
    })
    observer.observe(editor, { childList: true, characterData: true, subtree: true })

    function onBeforeUnload() {
      if (!saveTimer) return
      clearTimeout(saveTimer)
      const body = JSON.stringify({ date: openedDate, html: saveableHtml(), baseUpdatedAt })
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
      editor.removeEventListener('input', onInput)
      editor.removeEventListener('paste', onPaste)
      editor.removeEventListener('dragover', onDragOver)
      editor.removeEventListener('drop', onDrop)
      editor.removeEventListener('click', onEditorClick)
      editor.removeEventListener('dblclick', onEditorDblClick)
      editor.removeEventListener('keydown', onEditorKeydown)
      document.removeEventListener('click', onDocumentClick)
      observer.disconnect()
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
      <style>{EMBED_CSS}</style>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.length) uploadFilesRef.current(e.target.files)
          e.target.value = '' // 同じファイルを続けて選べるようにリセット
        }}
      />
      {/* 画像・PDF挿入ボタン。スマホではOS標準のカメラ/ギャラリー/ファイル選択が開く */}
      <button
        onClick={() => fileInputRef.current?.click()}
        aria-label="画像・PDFを追加"
        style={{
          position: 'fixed',
          right: 18,
          bottom: 24,
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'rgba(30,30,30,0.92)',
          border: '1px solid rgba(255,255,255,0.14)',
          color: '#6b6b6b',
          fontSize: 22,
          lineHeight: 1,
          cursor: 'pointer',
          zIndex: 10,
        }}
      >
        +
      </button>
      {embedSelected && (
        <button
          onClick={() => deleteEmbedRef.current()}
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 28,
            transform: 'translateX(-50%)',
            padding: '9px 16px',
            fontSize: 12,
            letterSpacing: '0.06em',
            color: '#d96b6b',
            background: 'rgba(30,30,30,0.92)',
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 999,
            cursor: 'pointer',
            zIndex: 10,
          }}
        >
          選択した埋め込みを削除
        </button>
      )}
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
