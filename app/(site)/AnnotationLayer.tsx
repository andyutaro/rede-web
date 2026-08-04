'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { anchorFromSelection, type Anchor } from '@/lib/site/annotate'
import Linkified from './Linkified'
import type { Annotation, AnnotationTarget } from '@/lib/site/annotations'
import { dateTimeParts } from '@/lib/site/text'

// 注釈の「操作」だけを持つ層(2026-08-01にScribeArchiveから切り出し)。
// 下線を引く=本文を描く側の仕事なので、そちらには手を出さない
// (確定アーカイブは一度描いて終わり、ライブは打鍵ごとに貼り直す、と事情が違うため)。
// ここが持つのは、タップで開く・選んで足す・書く・消す、の4つだけ。
//
// 注釈そのものの思想(2026-07-28 Andy指定): 引用範囲に細い下線だけを引き、
// タップで小さく開く。本文のレイアウトを一切動かさない。
export default function AnnotationLayer({
  rootRef,
  annotations,
  canEdit,
  target,
}: {
  // 本文が入っている器。ここの中の選択だけを受け付ける
  rootRef: React.RefObject<HTMLDivElement | null>
  annotations: Annotation[]
  canEdit: boolean
  target?: AnnotationTarget
}) {
  const router = useRouter()
  const [open, setOpen] = useState<{ a: Annotation; x: number; y: number } | null>(null)
  const [draft, setDraft] = useState<{
    id?: string
    blockId: string
    startOffset: number
    quote: string
    body: string
  } | null>(null)
  // 選択した瞬間にアンカーを確保しておく(2026-07-29 Andy報告の修正)。
  // クリック時に選択範囲を読み直す設計だと、選択が消えた後にボタンだけ残り
  // 「範囲を選択してください」になる(タップで選択が解除される・再描画で
  // 選択の土台ごと差し替わる等、選択が消える経路はいくつもある)
  const [pick, setPick] = useState<{ x: number; y: number; anchor: Anchor } | null>(null)
  const [busy, setBusy] = useState(false)

  // 注釈をタップ → 小さく開く
  useEffect(() => {
    const root = rootRef.current
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
  }, [annotations, rootRef])

  // 選択したら「注釈」ボタンを出す(ログイン中のみ)
  useEffect(() => {
    if (!canEdit) return
    const root = rootRef.current
    if (!root) return
    const onUp = () => {
      // クリックで選択が畳まれる場合があるので次のフレームで見る
      setTimeout(() => {
        const sel = window.getSelection()
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return setPick(null)
        if (!root.contains(sel.getRangeAt(0).commonAncestorContainer)) return setPick(null)
        // ここでアンカーを確保する。取れない選択(本文外・既存注釈との重なり)には
        // そもそもボタンを出さない=押してから断るより静か
        const res = anchorFromSelection(root)
        if ('error' in res) return setPick(null)
        const r = sel.getRangeAt(0).getBoundingClientRect()
        setPick({ x: r.left, y: r.bottom, anchor: res.anchor })
      }, 10)
    }
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchend', onUp)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchend', onUp)
    }
  }, [canEdit, rootRef])

  // 選択時に確保したアンカーを使う(クリック時に選択を読み直さない)
  const startDraft = useCallback((anchor: Anchor) => {
    setPick(null)
    setOpen(null)
    setDraft({ ...anchor, body: '' })
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

  // 注釈ポップアップの横位置(2026-07-28 Andy指摘): 注釈の左端に出すと文頭に被り、
  // 開いたままスクロールして読めなかった。**右端に寄せて文頭を空ける**。
  // 広い画面(1200px〜)は右レール(テーマ/MAIL/MENU/PODCASTピル)の手前で止め、
  // 本文右の余白に完全に収める。それより狭い画面はレール確保をやめて右端まで寄せ、
  // 文頭を最大限空ける方を優先(ポップアップはz-41でレールより前面なので、
  // 重なっても隠れて困らない)。
  //
  // ※**関数にしてある**のが重要: これをコンポーネント本体で計算すると
  // サーバー描画時にwindowが無くて落ち、React全体がクライアント描画へ
  // フォールバックしてしまう(2026-07-28に実際に踏んだ)。呼ぶのは
  // ポップアップを開いた後=クライアントだけを通る経路に限る
  const popGeometry = () => {
    const railW = window.innerWidth >= 1200 ? 110 : 12
    const width = Math.min(280, Math.max(200, window.innerWidth - railW - 32))
    return { width, left: Math.max(12, window.innerWidth - width - railW) }
  }

  return (
    <>
      {/* 注釈の中身(humbleなポップアップ) */}
      {open && (
        <>
          <div className="anno-veil" onClick={() => setOpen(null)} aria-hidden="true" />
          <div
            className="anno-pop"
            style={{ ...popGeometry(), top: Math.min(open.y + 8, window.innerHeight - 160) }}
            role="note"
          >
            {/* 注釈の中のURLはリンクとして機能させる(2026-07-28 Andy指摘)。
                長いURLは枠から溢れていたのでCSS側で折り返す */}
            <p className="anno-pop-body">
              <Linkified text={open.a.body} />
            </p>
            {/* いつ書き込んだか(2026-07-28 Andy指定)。注釈は「後から重ねた層」なので、
                いつの追記かが分かることに意味がある */}
            {(() => {
              const dt = dateTimeParts(open.a.createdAt)
              return dt ? (
                <p className="anno-pop-date">
                  <span>{dt.date}</span>
                  <span className="anno-pop-time">{dt.time}</span>
                </p>
              ) : null
            })()}
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
          onClick={() => startDraft(pick.anchor)}
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
