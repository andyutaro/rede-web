'use client'

import { useEffect, useRef, useState } from 'react'
import { connectLive, patchInto, sanitizeNodes } from '@/lib/scribe/liveClient'
import { applyAnnotations, clearAnnotations } from '@/lib/site/annotate'
import AnnotationLayer from '../AnnotationLayer'
import type { Annotation, AnnotationTarget } from '@/lib/site/annotations'
import { serverBodyHtml } from '@/lib/site/serverBody'

type Props = {
  relay: string | null
  today: string
  initialHtml: string | null
  // サーバー側で分かる「直近に書かれたか」(2026-07-29)。中継に繋がる前と、
  // JSを実行しない読み手にとっての初期表示に使う。接続後は中継の値が上書きする
  recentlyWritten?: boolean
  // 当日の本文にも注釈をつけられるようにする(2026-08-01 Andy指定)。
  // 宛先キーは確定アーカイブと同じ(kind:'scribe', key:日付)なので、
  // 0:01に確定した後もそのままアーカイブ側に引き継がれる
  annotations?: Annotation[]
  canEdit?: boolean
  target?: AnnotationTarget
}

// 当日ライブ全文ページ(/watch後継)の本文。ページ全体がスクロールし、
// 追従中は執筆点(最下部)に張り付く。読み返し中に打鍵が来たらチップで知らせる。
export default function LiveFull({
  relay,
  today,
  initialHtml,
  recentlyWritten = false,
  annotations = [],
  canEdit = false,
  target,
}: Props) {
  const viewRef = useRef<HTMLDivElement>(null)
  const [presence, setPresence] = useState<'live' | 'away'>(recentlyWritten ? 'live' : 'away')
  const [hasContent, setHasContent] = useState(Boolean(initialHtml))
  const [chipVisible, setChipVisible] = useState(false)
  const [chipPulse, setChipPulse] = useState(0)
  const followingRef = useRef(true)
  // サーバー描画用の本文は消さずに隠す(同じ器にinnerHTMLを残すと再描画で潰れる)
  const [ready, setReady] = useState(false)
  // 中継の購読は初回マウント時に一度だけ張るので、注釈は最新をrefで読む
  // (描画中にrefへ書かない=Reactの規約。effectで追従させる)
  const annosRef = useRef(annotations)
  useEffect(() => {
    annosRef.current = annotations
  }, [annotations])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const caret = document.createElement('span')
    caret.className = 'live-caret'
    caret.textContent = '▍'

    const doc = document.documentElement
    function isNearBottom() {
      return doc.scrollHeight - window.scrollY - window.innerHeight < 120
    }
    function scrollToLatest() {
      window.scrollTo(0, doc.scrollHeight)
    }
    function onScroll() {
      if (isNearBottom()) {
        followingRef.current = true
        setChipVisible(false)
      } else {
        followingRef.current = false
        setChipVisible(true)
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    function apply(html: string, scroll: boolean) {
      // 差分エンジンはDOMと受信HTMLのouterHTMLを比べるので、注釈spanが入ったままだと
      // そのブロックが毎回「変わった」と判定され、画像や動画ごと作り直されてしまう。
      // パッチの前に外し、後で貼り直す。キャレットも外してから貼る
      // (キャレットの文字が本文に混ざると注釈の文字位置がずれる)
      clearAnnotations(view!)
      patchInto(view!, sanitizeNodes(html))
      if (annosRef.current.length > 0) applyAnnotations(view!, annosRef.current)
      view!.appendChild(caret)
      setReady(true)
      setHasContent(true)
      if (scroll && followingRef.current) scrollToLatest()
    }

    let contentApplied = false
    if (initialHtml) {
      apply(initialHtml, false)
      contentApplied = true
      // 着地は文頭(2026-07-11 Andy指定)。最下部に飛ばすと空白に着地して
      // 何のページか分からないため、まず頭から読める状態にする。
      // 本文が画面より長い場合は追従をオフにし、チップで執筆点への導線を出す
      // (setStateはeffect本体で同期的に呼ばずタスクに逃がす)
      if (!isNearBottom()) followingRef.current = false
      setTimeout(() => {
        if (!followingRef.current) setChipVisible(true)
      }, 0)
    }

    let dispose = () => {}
    if (relay) {
      dispose = connectLive(relay, {
        onPresence: setPresence,
        onSnapshot: (html, { isReplay }) => {
          if (isReplay && !contentApplied) return // 前日replayで当日白紙を上書きしない
          contentApplied = true
          apply(html, true)
          if (!followingRef.current) setChipPulse((n) => n + 1) // 読み返し中: ●を脈打たせる
        },
        onDisconnect: () => setPresence('away'),
      })
    }
    return () => {
      window.removeEventListener('scroll', onScroll)
      dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 保存・削除の直後(router.refresh()で新しい配列が来る)は、次の打鍵を待たずに貼り直す
  useEffect(() => {
    const view = viewRef.current
    if (!view || !ready) return
    const caret = view.querySelector('.live-caret')
    caret?.remove()
    clearAnnotations(view)
    if (annotations.length > 0) applyAnnotations(view, annotations)
    if (caret) view.appendChild(caret)
  }, [annotations, ready])

  const mode = hasContent ? presence : 'idle'
  const dateLabel = today.replaceAll('-', '.')

  return (
    <section className="section">
      <div className="section-head">
        <h1>DESK — {dateLabel}</h1>
        {/* AWAYの正式表記はAWAY FROM SCREEN(2026-07-25 Andy)。スマホはAWAYに圧縮 */}
        <span className={`live-status ${mode === 'live' ? 'is-live' : ''}`}>
          <span className="live-dot" aria-hidden="true" />
          {mode === 'live' ? (
            'LIVE'
          ) : (
            <>
              AWAY<span className="ls-long"> FROM SCREEN</span>
            </>
          )}
        </span>
      </div>
      <div className="section-body">
        {mode === 'idle' && <div className="live-full-idle">{dateLabel}</div>}
        {/* ①サーバー描画用(JSを実行しない読み手向け)。JSが描いたら隠す */}
        <div
          className={`scribe-html live-full-body ${mode}${ready ? ' is-ssr-hidden' : ''}`}
          aria-hidden={ready || undefined}
          dangerouslySetInnerHTML={{ __html: serverBodyHtml(initialHtml) }}
        />
        {/* ②クライアントが書く器(innerHTMLを持たせない) */}
        <div className={`scribe-html live-full-body ${mode}`} ref={viewRef} />
        <AnnotationLayer
          rootRef={viewRef}
          annotations={annotations}
          canEdit={canEdit}
          target={target}
        />
      </div>
      <button
        type="button"
        className={`jump-chip ${chipVisible ? 'visible' : ''} ${mode === 'live' ? 'is-live' : ''}`}
        data-pulse={chipPulse}
        onClick={() => {
          window.scrollTo(0, document.documentElement.scrollHeight)
          followingRef.current = true
          setChipVisible(false)
        }}
      >
        <span className="live-dot" aria-hidden="true" />
        {mode === 'live' ? 'いま書いています ▼' : 'Away from Screen ▼'}
      </button>
    </section>
  )
}
