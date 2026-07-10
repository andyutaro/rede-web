'use client'

import { useEffect, useRef, useState } from 'react'
import { embedConfigFor, isBareUrl } from '@/lib/scribe/embed'

// 共有エディタコア(SSOT生HTML一本化、2026-07-09司令塔承認)。
// DeskEditorの編集機能(contenteditable・data-block-id・画像/動画/PDFアップロード・
// 埋め込みカード・URLリンク化・埋め込み選択削除)を管理画面用に切り出したもの。
// ライブ配信・オフライン下書き・日付跨ぎはscribe(放送卓)固有なので含めない。
// アップロードは/api/scribe/upload-url(認証済みセッション→署名URL)を共用する。

const EMBED_CSS = `
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
`

type Props = {
  initialHtml: string
  // 編集のたびに保存用HTML(選択表示・進行中プレースホルダ除去済み)を渡す。
  // デバウンスは呼び出し側の責務
  onChange: (html: string) => void
  onError?: (message: string) => void
  placeholder?: string
  minHeight?: string
}

export default function HtmlEditor({
  initialHtml,
  onChange,
  onError,
  placeholder = 'ここに書く',
  minHeight = '40vh',
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [embedSelected, setEmbedSelected] = useState(false)
  const uploadFilesRef = useRef<(files: FileList | File[]) => void>(() => {})
  const deleteEmbedRef = useRef<() => void>(() => {})
  // onChange/onErrorは毎レンダー新しい参照になりうるのでrefで持つ(メインeffectは初回のみ)
  const onChangeRef = useRef(onChange)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onChangeRef.current = onChange
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

    const MAX_UPLOAD = 50 * 1024 * 1024

    async function uploadFile(file: File) {
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      const isPdf = file.type === 'application/pdf'
      if (!isImage && !isVideo && !isPdf) return

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
        if (embed.classList.contains('embed-pdf')) e.preventDefault()
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

    editor.innerHTML = initialHtml
    assignBlockIds()

    function onInput() {
      emitChange()
    }
    editor.addEventListener('input', onInput)
    editor.addEventListener('paste', onPaste)
    editor.addEventListener('dragover', onDragOver)
    editor.addEventListener('drop', onDrop)
    editor.addEventListener('click', onEditorClick)
    editor.addEventListener('dblclick', onEditorDblClick)
    editor.addEventListener('keydown', onEditorKeydown)
    document.addEventListener('click', onDocumentClick)

    // 段落生成のたびにブロックIDを焼き込む(初日から、の原則をArticleにも適用)
    const observer = new MutationObserver(() => assignBlockIds())
    observer.observe(editor, { childList: true, subtree: true })

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
    }
    // 初回マウント時のみ(initialHtmlは初回描画専用)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="html-editor">
      <style>{EMBED_CSS}</style>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.length) uploadFilesRef.current(e.target.files)
          e.target.value = ''
        }}
      />
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className="html-editor-surface"
        style={{ minHeight }}
      />
      <div className="html-editor-toolbelt">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          aria-label="画像・動画・PDFを追加"
          className="html-editor-add"
        >
          +
        </button>
        {embedSelected && (
          <button type="button" onClick={() => deleteEmbedRef.current()} className="html-editor-delete">
            選択した埋め込みを削除
          </button>
        )}
      </div>
    </div>
  )
}
