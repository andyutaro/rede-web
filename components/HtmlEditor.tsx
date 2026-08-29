'use client'

import { useEffect, useRef, useState } from 'react'
import { embedConfigFor, isBareUrl } from '@/lib/scribe/embed'

// 共有エディタコア(SSOT生HTML一本化、2026-07-09司令塔承認)。
// 放送卓(/desk)と管理画面(/studio)の両方がこの1系統を使う(2026-07-10載せ替え完了)。
// 中身: contenteditable・data-block-id焼き込み・画像/動画/PDFアップロード・
// 埋め込みカード・URLリンク化・埋め込み選択削除。
// 放送卓固有の関心(ライブ配信・オフライン下書き・楽観ロック・日付跨ぎ)は
// DeskEditor側がprops/controller経由で載せる。
// アップロードは/api/scribe/upload(認証済みセッション→R2へ直接)を共用する。

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
/* max-heightは公開側(site.css)と同じ理由: 縦動画が画面の高さを越えると
   放送卓でも書いている場所が見えなくなる。置換要素なので縦横比は保たれる */
.embed-video { display: block; max-width: 100%; max-height: 70vh; border-radius: 6px; margin: 14px 0; }
/* 音源は縦に場所を取らない一本の帯。幅は本文いっぱい=シークバーを掴みやすくする */
.embed-audio { display: block; width: 100%; margin: 14px 0; cursor: pointer; }
.embed-selected { outline: 2px solid #7fb0e0; outline-offset: 3px; border-radius: 6px; }
a.plain-link { color: #7fb0e0; text-decoration: underline; word-break: break-all; }
.upload-placeholder { display: block; width: fit-content; padding: 10px 14px; margin: 10px 0;
  background: rgba(255,255,255,0.04); border-radius: 8px; color: #6b6b6b; font-size: 14px; }
.html-editor-surface { width: 100%; font-size: 17px; line-height: 1.9; color: #e8e6e0;
  outline: none; white-space: pre-wrap; word-break: break-word; caret-color: #e8e6e0; padding: 4px 0; }
.html-editor-surface:empty::before { content: attr(data-placeholder); color: #4a4a4a; pointer-events: none; }
/* 道具は右下にまとめる(2026-08-01 Andy: スマホで書くので、右利きの親指が届く位置)。
   縦積みにして、ボタンの上へメニューが開く。横並びだと長いチップが画面からはみ出す */
.html-editor-toolbelt { position: fixed; right: 18px; bottom: 24px; display: flex;
  flex-direction: column; align-items: flex-end; gap: 10px; z-index: 10; }
.html-editor-add { width: 44px; height: 44px; border-radius: 50%; background: rgba(30,30,30,0.92);
  border: 1px solid rgba(255,255,255,0.14); color: #6b6b6b; font-size: 22px; line-height: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center; }
.html-editor-delete { padding: 9px 16px; font-size: 12px; letter-spacing: 0.06em; color: #d96b6b;
  background: rgba(30,30,30,0.92); border: 1px solid rgba(255,255,255,0.14); border-radius: 999px; cursor: pointer; }
/* メニューの項目。削除チップと同じ形(丸いチップ)で、色だけ通常色にする */
.html-editor-menuitem { padding: 9px 16px; font-size: 12px; letter-spacing: 0.06em; color: #e8e6e0;
  background: rgba(30,30,30,0.92); border: 1px solid rgba(255,255,255,0.14); border-radius: 999px;
  cursor: pointer; font-family: inherit; white-space: nowrap; }
.html-editor-menuitem:hover { border-color: rgba(255,255,255,0.35); }
.html-editor-bars { display: block; }
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
  // 右下のボタンに相乗りさせる行き先(2026-08-01 Andy指定)。
  // 渡すとボタンがメニューになり、「画像・動画・PDFを追加」と一緒に並ぶ。
  // 渡さなければ従来どおり+ボタン1つのまま(studioのエディタは変えない)
  menuActions?: { label: string; onClick: () => void }[]
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
  menuActions,
}: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [embedSelected, setEmbedSelected] = useState(false)
  // 右下のメニューの開閉(menuActionsが渡された時だけ使う)
  const [menuOpen, setMenuOpen] = useState(false)
  const hasMenu = (menuActions?.length ?? 0) > 0
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
        // 保存する上限辺(2026-07-29に2000→1600へ)。表示側の最大はIMG_W.photo=1280
        // (本文幅640のRetina想定)なので1600で十分な余裕がある。Storage無料枠1GBの
        // 消費ペースを落とすための縮小(既存ファイルは変えない=新規アップロードから効く)
        const MAX = 1600
        const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height))
        // 素通しの閾値も下げる(1.5MB→500KB)=大きい画像はほぼ必ず再圧縮を通す
        if (scale >= 1 && file.size < 500 * 1024) return file
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(bmp.width * scale)
        canvas.height = Math.round(bmp.height * scale)
        canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
        const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
        return blob && blob.size < file.size ? blob : file
      } catch {
        return file
      }
    }

    // 進捗イベントを取るためfetchではなくXHRでPUTする。
    // 応答の本文(publicUrlのJSON)も返す=送信と結果取得を1往復で済ませる
    type PutFail = { status: number; reason?: string }
    function putWithProgress(url: string, blob: Blob, onProgress: (pct: number) => void) {
      return new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('PUT', url)
        xhr.setRequestHeader('content-type', blob.type || 'application/octet-stream')
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
        }
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) return resolve(xhr.responseText)
          // サーバーが理由を返していれば拾って出す(2026-08-29)。
          // 「500」だけでは何が起きたか分からず、原因追跡に往復が要る
          let reason: string | undefined
          try {
            reason = JSON.parse(xhr.responseText)?.error
          } catch {
            // 本文がJSONでないときは理由なしで進む
          }
          reject({ status: xhr.status, reason } as PutFail)
        }
        xhr.onerror = () => reject({ status: 0 } as PutFail)
        xhr.send(blob)
      })
    }

    const MAX_UPLOAD = 50 * 1024 * 1024 // Supabase無料枠のファイル上限

    async function uploadFile(file: File) {
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      // 音源(2026-08-27 Andy指定)。動画と同じ扱いで、本文の中でシークバー付きで鳴る
      const isAudio = file.type.startsWith('audio/')
      const isPdf = file.type === 'application/pdf'
      if (!isImage && !isVideo && !isAudio && !isPdf) return

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
        const fallbackExt = isPdf ? 'pdf' : isVideo ? 'mp4' : isAudio ? 'mp3' : 'png'
        const origExt = (file.name.split('.').pop() || fallbackExt).toLowerCase()
        const ext = blob === file ? origExt : 'jpg'
        let lastShown = -5
        let publicUrl: string
        try {
          const body = await putWithProgress(
            `/api/scribe/upload?ext=${encodeURIComponent(ext)}`,
            blob,
            (pct) => {
              // 5%刻みで更新(全量スナップショット配信なので更新頻度を抑える)
              if (pct - lastShown >= 5 || pct === 100) {
                lastShown = pct
                ph.textContent = `アップロード中… ${pct}%`
              }
            }
          )
          publicUrl = JSON.parse(body).publicUrl
          if (!publicUrl) throw { status: 500 } as PutFail
        } catch (e) {
          // 理由を出す(2026-08-27)。これまで全ての失敗が「アップロード失敗」の
          // 一言だったので、mp3が弾かれていたとき原因が分からなかった。
          // 401はセッション切れで、書いている最中に起きうる=見分けが要る
          const status = (e as PutFail)?.status ?? 0
          const reason = (e as PutFail)?.reason
          ph.remove()
          if (reason && status >= 500) {
            fail(`アップロード失敗: ${reason}`)
            return
          }
          fail(
            status === 400
              ? `アップロード失敗: この形式(.${ext})は受け付けていません`
              : status === 401
                ? 'アップロード失敗: ログインが切れています'
                : status === 413
                  ? 'アップロード失敗: ファイルが大きすぎます(上限50MB)'
                  : status === 0
                    ? 'アップロード失敗: 通信が切れました'
                    : `アップロード失敗: 保存できませんでした(${status})`
          )
          return
        }

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
        } else if (isAudio) {
          const audio = document.createElement('audio')
          audio.className = 'embed-audio'
          audio.src = publicUrl
          audio.controls = true
          // metadata=尺だけ先に取る。本文を開いただけで全部落とさない
          // (回線と、Supabase無料枠の転送量への配慮)
          audio.preload = 'metadata'
          node = audio
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

    // 単体URLをカード(ポッドキャスト/動画)またはリンクとしてキャレット位置に挿入
    function insertUrlAtCaret(url: string) {
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
      insertUrlAtCaret(text.trim())
    }

    // AndroidのGboard等はクリップボードからの貼り付けでpasteイベントを発火させず、
    // beforeinput(insertFromPaste)やinsertTextでテキストを流し込むことがある。
    // 一撃で完全なURLが入ってくるのは貼り付けだけ(手打ちは1文字ずつ)なので、
    // 挿入テキスト全体が単体URLのときだけ横取りしてカード化する
    function onBeforeInput(e: Event) {
      const ev = e as InputEvent
      if (ev.inputType !== 'insertFromPaste' && ev.inputType !== 'insertText') return
      const text = ev.dataTransfer?.getData('text/plain') ?? ev.data ?? ''
      if (!isBareUrl(text)) return
      e.preventDefault()
      insertUrlAtCaret(text.trim())
    }

    // さらにIMEがペーストを合成テキストとして確定する経路(insertCompositionTextは
    // キャンセル不可)への対応: 確定された文字列が単体URLなら、挿入済みの生テキストを
    // キャレット位置から遡って取り除き、カードに置き換える
    function onCompositionEnd(e: CompositionEvent) {
      const text = (e.data ?? '').trim()
      if (!isBareUrl(text)) return
      const sel = window.getSelection()
      if (!sel || !sel.rangeCount) return
      const range = sel.getRangeAt(0)
      const node = range.startContainer
      if (node.nodeType !== Node.TEXT_NODE || !editor!.contains(node)) return
      const content = node.textContent ?? ''
      const start = range.startOffset - text.length
      if (start < 0 || content.slice(start, range.startOffset) !== text) return
      node.textContent = content.slice(0, start) + content.slice(range.startOffset)
      const r = document.createRange()
      r.setStart(node, start)
      r.collapse(true)
      sel.removeAllRanges()
      sel.addRange(r)
      insertUrlAtCaret(text)
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
      const embed = (e.target as HTMLElement).closest?.('.embed-image, .embed-pdf, .embed-podcast, .embed-video, .embed-audio') as HTMLElement | null
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
    editor.addEventListener('beforeinput', onBeforeInput)
    editor.addEventListener('compositionend', onCompositionEnd)
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
      editor.removeEventListener('beforeinput', onBeforeInput)
      editor.removeEventListener('compositionend', onCompositionEnd)
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
        accept="image/*,video/*,audio/*,application/pdf"
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
        {/* メニュー(2026-08-01): ボタンを増やさずに行き先を持たせるため、
            「追加」と行き先を1つのボタンの中にまとめる。開いた時だけ項目が立つ */}
        {hasMenu && menuOpen && (
          <>
            <button
              type="button"
              className="html-editor-menuitem"
              onClick={() => {
                setMenuOpen(false)
                fileInputRef.current?.click()
              }}
            >
              画像・動画・PDFを追加
            </button>
            {menuActions!.map((a) => (
              <button
                key={a.label}
                type="button"
                className="html-editor-menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  a.onClick()
                }}
              >
                {a.label}
              </button>
            ))}
          </>
        )}
        <button
          type="button"
          onClick={() => (hasMenu ? setMenuOpen((v) => !v) : fileInputRef.current?.click())}
          aria-label={hasMenu ? (menuOpen ? 'メニューを閉じる' : 'メニュー') : '画像・動画・PDFを追加'}
          aria-expanded={hasMenu ? menuOpen : undefined}
          className="html-editor-add"
        >
          {!hasMenu || menuOpen ? (
            menuOpen ? '×' : '+'
          ) : (
            <svg className="html-editor-bars" width="18" height="12" viewBox="0 0 18 12" aria-hidden="true">
              <path d="M0 1h18M0 6h18M0 11h18" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
