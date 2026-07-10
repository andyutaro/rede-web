'use client'

import { useEffect, useRef, useState } from 'react'
import { embedConfigFor, isBareUrl } from '@/lib/scribe/embed'

// 共有エディタコア(SSOT生HTML一本化、2026-07-09司令塔承認)。
// 放送卓(/desk)と管理画面(/studio)の両方がこの1系統を使う(2026-07-10載せ替え完了)。
// 中身: contenteditable・data-block-id焼き込み・画像/動画/PDFアップロード・
// 埋め込みカード・URLリンク化・埋め込み選択削除。
// 放送卓固有の関心(ライブ配信・オフライン下書き・楽観ロック・日付跨ぎ)は
// DeskEditor側がprops/controller経由で載せる。
// アップロードは/api/scribe/upload-url(認証済みセッション→署名URL)を共用する。

// クラス名は旧scribe・/watchサニタイザのホワイトリストと一致させている。
// スタイルはコンポーネント自身が持つ(desk/studioどちらのページCSSにも依存しない)
const EDITOR_CSS = `
.embed-image { display: block; max-width: 100%; border-radius: 6px; margin: 14px 0; cursor: pointer; }
.embed-pdf { display: flex; align-items: center; gap: 10px; padding: 10px 14px; margin: 10px 0;
  background: rgba(255,255,255,0.04); border-radius: 8px; color: #e8e6e0; text-decoration: none;
  width: fit-content; font-size: 14px; cursor: pointer; }
.embed-podcast { display: block; margin: 14px 0; border-radius: 10px; cursor: pointer;
  overflow: hidden; background: rgba(255,255,255,0.03); }
.embed-podcast iframe { display: block; border: none; width: 100%; }
.embed-video { display: block; max-width: 100%; border-radius: 6px; margin: 14px 0; }
.embed-selected { outline: 2px solid #7fb0e0; outline-offset: 3px; border-radius: 6px; }
a.plain-link { color: #7fb0e0; text-decoration: underline; word-break: break-all; }
.upload-placeholder { display: block; width: fit-content; padding: 10px 14px; margin: 10px 0;
  background: rgba(255,255,255,0.04); border-radius: 8px; color: #6b6b6b; font-size: 14px; }
.html-editor-surface { width: 100%; font-size: 17px; line-height: 1.9; color: #e8e6e0;
  outline: none; white-space: pre-wrap; word-break: break-word; caret-color: #e8e6e0; padding: 4px 0; }
.html-editor-surface:empty::before { content: attr(data-placeholder); color: #4a4a4a; pointer-events: none; }
.html-editor-toolbelt { position: fixed; right: 18px; bottom: 24px; display: flex;
  align-items: center; gap: 12px; z-index: 10; }
.html-editor-add { width: 44px; height: 44px; border-radius: 50%; background: rgba(30,30,30,0.92);
  border: 1px solid rgba(255,255,255,0.14); color: #6b6b6b; font-size: 22px; line-height: 1; cursor: pointer; }
.html-editor-delete { padding: 9px 16px; font-size: 12px; letter-spacing: 0.06em; color: #d96b6b;
  background: rgba(30,30,30,0.92); border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; cursor: pointer; }
`

// 外側(DeskEditor等)からの命令的操作。他端末の内容の取り込み(applyRemote)と
// sendBeacon用の保存HTML取得に使う
export type HtmlEditorController = {
  // 内容を丸ごと差し替える(選択状態は破棄、ブロックID焼き込み、キャレットは末尾)
  setHtml: (html: string) => void
  // 保存用HTML(選択表示・進行中アップロードプレースホルダ除去済み)
  getSaveableHtml: () => string
}

type Props = {
  initialHtml: string
  // 編集のたびに保存用HTMLを渡す。デバウンスは呼び出し側の責務
  onChange: (html: string) => void
  // DOM変化のたびに生のinnerHTMLを渡す(ライブ配信の全量スナップショット用。
  // アップロード進捗プレースホルダも含む=watch側に進捗が見える)
  onRawChange?: (rawHtml: string) => void
  onError?: (message: string) => void
  placeholder?: string
  minHeight?: string
  // 面のタイポグラフィ上書き(deskは18px等)
  surfaceStyle?: React.CSSProperties
  // マウント時に末尾へキャレットを置いてフォーカス(desk)
  autoFocus?: boolean
  // カーソルが画面下55%より下に来たら40%あたりまで能動スクロール(desk)
  keepCaretCentered?: boolean
  controllerRef?: React.MutableRefObject<HtmlEditorController | null>
}

export default function HtmlEditor({
  initialHtml,
  onChange,
  onRawChange,
  onError,
  placeholder = 'ここに書く',
  minHeight = '40vh',
  surfaceStyle,
  autoFocus = false,
  keepCaretCentered = false,
  controllerRef,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [embedSelected, setEmbedSelected] = useState(false)
  const uploadFilesRef = useRef<(files: FileList | File[]) => void>(() => {})
  const deleteEmbedRef = useRef<() => void>(() => {})
  // コールバックは毎レンダー新しい参照になりうるのでrefで持つ(メインeffectは初回のみ)
  const onChangeRef = useRef(onChange)
  const onRawChangeRef = useRef(onRawChange)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onChangeRef.current = onChange
    onRawChangeRef.current = onRawChange
    onErrorRef.current = onError
  })

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    function saveableHtml() {
      const clone = editor!.cloneNode(true) as HTMLElement
      clone.querySelectorAll('.embed-selected').forEach((el) => el.classList.remove('embed-selected'))
      clone.querySelectorAll('.upload-placeholder').forEach((el) => el.remove())
      return clone.innerHTML
    }

    function assignBlockIds() {
      for (const child of Array.from(editor!.children)) {
        if (!child.hasAttribute('data-block-id')) {
          child.setAttribute('data-block-id', crypto.randomUUID())
        }
      }
    }

    function emitChange() {
      onChangeRef.current(saveableHtml())
    }

    function fail(message: string) {
      onErrorRef.current?.(message)
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

    // 進捗イベントを取るためsupabase-jsではなくXHRで署名URLへPUTする
    function putWithProgress(url: string, blob: Blob, onProgress: (pct: number) => void) {
      return new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', url)
        xhr.setRequestHeader('content-type', blob.type || 'application/octet-stream')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))))
        xhr.onerror = () => reject(new Error('network'))
        xhr.send(blob)
      })
    }

    const MAX_UPLOAD = 50 * 1024 * 1024 // Supabase無料枠のファイル上限

    async function uploadFile(file: File) {
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      const isPdf = file.type === 'application/pdf'
      if (!isImage && !isVideo && !isPdf) return

      // 進捗プレースホルダ。DOMに入れることでライブ配信に乗り、
      // deskとwatchの両方で同じ進捗が見える。アーカイブ保存からは
      // saveableHtml()が除外するので、失敗の痕跡はDBに残らない
      const ph = document.createElement('div')
      ph.className = 'upload-placeholder'
      ph.contentEditable = 'false'
      ph.textContent = 'アップロード中… 0%'
      insertNodeAtCaret(ph)

      try {
        const blob = isImage ? await downscaleImage(file) : file
        if (blob.size > MAX_UPLOAD) {
          ph.remove()
          fail('ファイルが大きすぎます(上限50MB)')
          return
        }
        const fallbackExt = isPdf ? 'pdf' : isVideo ? 'mp4' : 'png'
        const origExt = (file.name.split('.').pop() || fallbackExt).toLowerCase()
        const ext = blob === file ? origExt : 'jpg'
        const res = await fetch('/api/scribe/upload-url', { method: 'POST', body: JSON.stringify({ ext }) })
        if (!res.ok) throw new Error('upload-url failed')
        const { signedUrl, publicUrl } = await res.json()

        let lastShown = -5
        await putWithProgress(signedUrl, blob, (pct) => {
          // 5%刻みで更新(全量スナップショット配信なので更新頻度を抑える)
          if (pct - lastShown >= 5 || pct === 100) {
            lastShown = pct
            ph.textContent = `アップロード中… ${pct}%`
          }
        })

        let node: HTMLElement
        if (isImage) {
          const img = document.createElement('img')
          img.className = 'embed-image'
          img.src = publicUrl
          node = img
        } else if (isVideo) {
          const video = document.createElement('video')
          video.className = 'embed-video'
          video.src = publicUrl
          video.controls = true
          video.playsInline = true
          video.preload = 'metadata'
          node = video
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
        ph.replaceWith(node, document.createElement('br'))
        emitChange()
      } catch {
        ph.remove()
        fail('アップロード失敗')
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
      emitChange()
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
    function setSelected(el: HTMLElement | null) {
      if (selectedEmbed && selectedEmbed !== el) selectedEmbed.classList.remove('embed-selected')
      selectedEmbed = el
      if (el) el.classList.add('embed-selected')
      setEmbedSelected(!!el)
    }
    deleteEmbedRef.current = () => {
      if (!selectedEmbed) return
      selectedEmbed.remove()
      setSelected(null)
      emitChange()
    }
    function onEditorClick(e: MouseEvent) {
      const embed = (e.target as HTMLElement).closest?.('.embed-image, .embed-pdf, .embed-podcast, .embed-video') as HTMLElement | null
      if (embed) {
        if (embed.classList.contains('embed-pdf')) e.preventDefault() // シングルクリックは選択のみ
        setSelected(embed)
      } else {
        setSelected(null)
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
      if (!editor!.contains(e.target as Node)) setSelected(null)
    }

    // カーソルが画面下55%より下に来たら、40%あたりまで能動的にスクロールする(desk)
    function centerCaret() {
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount) return
      const range = sel.getRangeAt(0).cloneRange()
      range.collapse(true)
      const rect = range.getClientRects()[0]
      if (!rect) return
      const viewportHeight = window.innerHeight
      if (rect.top > viewportHeight * 0.55) {
        window.scrollBy({ top: rect.top - viewportHeight * 0.4 })
      }
    }

    editor.innerHTML = initialHtml
    assignBlockIds()
    if (autoFocus) placeCaretAtEnd()

    if (controllerRef) {
      controllerRef.current = {
        setHtml(html: string) {
          setSelected(null) // DOMを差し替えるので選択状態を破棄
          editor.innerHTML = html
          assignBlockIds()
          placeCaretAtEnd()
        },
        getSaveableHtml: saveableHtml,
      }
    }

    function onInput() {
      emitChange()
      if (keepCaretCentered) centerCaret()
    }
    editor.addEventListener('input', onInput)
    editor.addEventListener('paste', onPaste)
    editor.addEventListener('dragover', onDragOver)
    editor.addEventListener('drop', onDrop)
    editor.addEventListener('click', onEditorClick)
    editor.addEventListener('dblclick', onEditorDblClick)
    editor.addEventListener('keydown', onEditorKeydown)
    document.addEventListener('click', onDocumentClick)

    // 段落生成のたびにブロックIDを焼き込む。ライブ配信(onRawChange)は
    // deskの旧実装と同じく「DOM変化ごと・デバウンスなし・全量スナップショット」
    const observer = new MutationObserver(() => {
      assignBlockIds()
      onRawChangeRef.current?.(editor.innerHTML)
    })
    observer.observe(editor, { childList: true, characterData: true, subtree: true })

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
      if (controllerRef) controllerRef.current = null
    }
    // 初回マウント時のみ(initialHtml等は初回描画専用)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="html-editor">
      <style>{EDITOR_CSS}</style>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.length) uploadFilesRef.current(e.target.files)
          e.target.value = '' // 同じファイルを続けて選べるようにリセット
        }}
      />
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className="html-editor-surface"
        style={{ minHeight, ...surfaceStyle }}
      />
      <div className="html-editor-toolbelt">
        {embedSelected && (
          <button type="button" onClick={() => deleteEmbedRef.current()} className="html-editor-delete">
            選択した埋め込みを削除
          </button>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="画像・動画・PDFを追加"
          className="html-editor-add"
        >
          +
        </button>
      </div>
    </div>
  )
}
