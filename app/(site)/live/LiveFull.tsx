'use client'

import { useEffect, useRef, useState } from 'react'
import { connectLive, patchInto, sanitizeNodes } from '@/lib/scribe/liveClient'
import { serverBodyHtml } from '@/lib/site/serverBody'

type Props = {
  relay: string | null
  today: string
  initialHtml: string | null
  // サーバー側で分かる「直近に書かれたか」(2026-07-29)。中継に繋がる前と、
  // JSを実行しない読み手にとっての初期表示に使う。接続後は中継の値が上書きする
  recentlyWritten?: boolean
}

// 当日ライブ全文ページ(/watch後継)の本文。ページ全体がスクロールし、
// 追従中は執筆点(最下部)に張り付く。読み返し中に打鍵が来たらチップで知らせる。
export default function LiveFull({ relay, today, initialHtml, recentlyWritten = false }: Props) {
  const viewRef = useRef<HTMLDivElement>(null)
  const [presence, setPresence] = useState<'live' | 'away'>(recentlyWritten ? 'live' : 'away')
  const [hasContent, setHasContent] = useState(Boolean(initialHtml))
  const [chipVisible, setChipVisible] = useState(false)
  const [chipPulse, setChipPulse] = useState(0)
  const followingRef = useRef(true)

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
      patchInto(view!, sanitizeNodes(html), caret)
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

  const mode = hasContent ? presence : 'idle'
  const dateLabel = today.replaceAll('-', '.')

  return (
    <section className="section">
      <div className="section-head">
        <h1>SCRIBE — {dateLabel}</h1>
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
        {/* サーバー描画にも本文を出す(2026-07-29)。JSを実行しない読み手に
            空ページとして見えていたため。マウント後にリッチ版へ差し替わる */}
        <div
          className={`scribe-html live-full-body ${mode}`}
          ref={viewRef}
          dangerouslySetInnerHTML={{ __html: serverBodyHtml(initialHtml) }}
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
