'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { sanitizeNodes } from '@/lib/scribe/liveClient'
import { applyAnnotations, anchorFromSelection } from '@/lib/site/annotate'
import type { Annotation, AnnotationTarget } from '@/lib/site/annotations'

// 確定アーカイブの本文表示。ライブと同じホワイトリスト・サニタイザを通す
// (アーカイブは確定テキストなのでキャレット・差分適用は不要)。
//
// #p=<ファイル名> が付いていたら、その写真まで自動スクロール(2026-07-25)。
// PHOTOLOGの「タップで掲載ページの当該箇所へ」の受け側。本文はこのコンポーネントが
// マウント後に注入するため、ブラウザ標準のフラグメント移動は使えない=自前で送る。
//
// 注釈(2026-07-28 Andy指定): 引用範囲に細い下線だけを引き、タップで小さく開く。
// 本文のレイアウトを一切動かさないので、うるさくならず「同じ頃の作品」とも競合しない。
// ログイン中は自分のサイトを普通に見ている画面から、ドラッグして直接足せる。
export default function ScribeArchive({
  html,
  annotations = [],
  canEdit = false,
  target,
}: {
  html: string
  annotations?: Annotation[]
  canEdit?: boolean
  target?: AnnotationTarget
}) {
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const [open, setOpen] = useState<{ a: Annotation; x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<{
    id?: string
    blockId: string
    startOffset: number
    quote: string
    body: string
    x: number
    y: number
  } | null>(null)
  const [pick, setPick] = useState<{ x: number; y: number } | null>(null)
  const [busy, setBusy] = useState(false)

  // 本文の注入(+注釈の適用)。annotationsが変わったら貼り直す
  useEffect(() => {
    const root = ref.current
    if (!root) return
    root.replaceChildren(...sanitizeNodes(html))
    if (annotations.length > 0) applyAnnotations(root, annotations)

    const m = window.location.hash.match(/^#p=(.+)$/)
    if (!m) return
    const name = decodeURIComponent(m[1])
    const img = Array.from(root.querySelectorAll('img')).find((i) => i.src.endsWith(`/${name}`))
    if (!img) return
    const jump = () => img.scrollIntoView({ block: 'center' })
    jump()
    if (!img.complete) img.addEventListener('load', jump, { once: true })
  }, [html, annotations])

  // 注釈をタップ → 小さく開く
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest?.('.anno') as HTMLElement | null
      if (!el) return
      const a = annotations.find((x) => x.id === el.dataset.annoId)
      if (!a) return
      const r = el.getBoundingClientRect()
      setPick(null)
      setOpen({ a, x: r.left, y: r.bottom })
    }
    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [annotations])

  // 選択したら「注釈」ボタンを出す(ログイン中のみ)
  useEffect(() => {
    if (!canEdit) return
    const root = ref.current
    if (!root) return
    const onUp = () => {
      // クリックで選択が畳まれる場合があるので次のフレームで見る
      setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return setPick(null)
        if (!root.contains(sel.getRangeAt(0).commonAncestorContainer)) return setPick(null)
        const r = sel.getRangeAt(0).getBoundingClientRect()
        setPick({ x: r.left, y: r.bottom })
      }, 10)
    }
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchend', onUp)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchend', onUp)
    }
  }, [canEdit])

  const startDraft = useCallback(() => {
    const root = ref.current
    if (!root) return
    const anchor = anchorFromSelection(root)
    if (!anchor) {
      window.alert('注釈は一つの段落の中で選んでください')
      return
    }
    setPick(null)
    setOpen(null)
    setDraft({ ...anchor, body: '', x: window.innerWidth / 2 - 150, y: window.innerHeight / 2 - 80 })
  }, [])

  async function save() {
    if (!draft || !target || busy) return
    const body = draft.body.trim()
    if (!body) return
    setBusy(true)
    try {
      const res = await fetch('/api/annotations', {
        method: 'POST',
        body: JSON.stringify({
          action: draft.id ? 'update' : 'create',
          id: draft.id,
          target,
          blockId: draft.blockId,
          startOffset: draft.startOffset,
          quote: draft.quote,
          body,
        }),
      })
      if (!res.ok) throw new Error()
      setDraft(null)
      router.refresh()
    } catch {
      window.alert('保存に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (busy || !window.confirm('この注釈を削除しますか？')) return
    setBusy(true)
    try {
      const res = await fetch('/api/annotations', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', id }),
      })
      if (!res.ok) throw new Error()
      setOpen(null)
      setDraft(null)
      router.refresh()
    } catch {
      window.alert('削除に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  // 画面外にはみ出さないよう寄せる
  const clamp = (x: number, w: number) => Math.max(12, Math.min(x, window.innerWidth - w - 12))

  return (
    <>
      <div className="scribe-html scribe-archive-body" ref={ref} />

      {/* 注釈の中身(humbleなポップアップ) */}
      {open && (
        <>
          <div className="anno-veil" onClick={() => setOpen(null)} aria-hidden="true" />
          <div
            className="anno-pop"
            style={{ left: clamp(open.x, 300), top: Math.min(open.y + 8, window.innerHeight - 160) }}
            role="note"
          >
            <p className="anno-pop-body">{open.a.body}</p>
            {canEdit && (
              <div className="anno-pop-acts">
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      id: open.a.id,
                      blockId: open.a.blockId,
                      startOffset: open.a.startOffset,
                      quote: open.a.quote,
                      body: open.a.body,
                      x: window.innerWidth / 2 - 150,
                      y: window.innerHeight / 2 - 80,
                    })
                  }
                >
                  編集
                </button>
                <button type="button" onClick={() => remove(open.a.id)} disabled={busy}>
                  削除
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* 選択直後に出る小さな「注釈」ボタン(ログイン中のみ) */}
      {canEdit && pick && !draft && (
        <button
          type="button"
          className="anno-add"
          style={{ left: clamp(pick.x, 76), top: Math.min(pick.y + 8, window.innerHeight - 48) }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={startDraft}
        >
          注釈
        </button>
      )}

      {/* 注釈の入力(中央に小さく) */}
      {canEdit && draft && (
        <>
          <div className="anno-veil" onClick={() => setDraft(null)} aria-hidden="true" />
          <div className="anno-editor" role="dialog" aria-label="注釈">
            <p className="anno-editor-quote">「{draft.quote}」</p>
            <textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="ここに注釈を書く"
              rows={4}
              maxLength={2000}
              autoFocus
            />
            <div className="anno-editor-acts">
              <button type="button" onClick={() => setDraft(null)} disabled={busy}>
                取消
              </button>
              <button type="button" onClick={save} disabled={busy || !draft.body.trim()}>
                {busy ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
