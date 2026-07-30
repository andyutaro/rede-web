'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { connectLive, patchInto, sanitizeNodes } from '@/lib/scribe/liveClient'
import { serverBodyHtml, bodyCharCount } from '@/lib/site/serverBody'

type Props = {
  relay: string | null
  today: string // YYYY-MM-DD (東京)
  // DB上の当日行のHTML。null=当日未執筆(idle起点)。
  initialHtml: string | null
  // サーバー側で分かる「直近に書かれたか」(2026-07-29)。接続後は中継の値が上書きする
  recentlyWritten?: boolean
}

type Mode = 'live' | 'away' | 'idle'

// Homeの「窓」(handoff-notes §3): 全文ではなく執筆点だけを映す。
// 高さ390px固定・下端追従・上端130pxフェード。ページ全体の高さは執筆量に関わらず不変。
export default function LiveWindow({ relay, today, initialHtml, recentlyWritten = false }: Props) {
  const viewRef = useRef<HTMLDivElement>(null)
  const caretRef = useRef<HTMLElement | null>(null)
  const [presence, setPresence] = useState<'live' | 'away'>(recentlyWritten ? 'live' : 'away')
  const [hasContent, setHasContent] = useState(Boolean(initialHtml))
  // 字数はサーバー描画でも実数を出す(0字に見えていた)
  const [charCount, setCharCount] = useState(() => bodyCharCount(initialHtml))
  // サーバー描画用の本文は消さずに隠す(同じ器にinnerHTMLを残すと再描画で潰れる)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const view = viewRef.current
    if (!view) return

    const caret = document.createElement('span')
    caret.className = 'live-caret'
    caret.textContent = '▍'
    caretRef.current = caret

    // 内容が更新されるたびに文字数を数え直す(空白・改行は数えない)
    function apply(html: string) {
      patchInto(view!, sanitizeNodes(html), caret)
      setReady(true)
      setCharCount((view!.textContent ?? '').replace(/\s+/g, '').length)
      setHasContent(true)
    }

    let contentApplied = false
    if (initialHtml) {
      apply(initialHtml)
      contentApplied = true
    }

    if (!relay) return

    const dispose = connectLive(relay, {
      onPresence: setPresence,
      onSnapshot: (html, { isReplay }) => {
        // 中継が日を跨いで保持していた前日スナップショットで idle(当日白紙) を
        // 上書きしない: DBに当日行がない場合、replayは捨てて live の実打鍵だけ映す
        if (isReplay && !contentApplied) return
        contentApplied = true
        apply(html)
      },
      onDisconnect: () => setPresence('away'),
    })
    return dispose
    // initialHtml/relayはサーバーから初回に渡される値で、マウント後は変わらない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const mode: Mode = hasContent ? presence : 'idle'
  const dateLabel = today.replaceAll('-', '.')

  return (
    <section className="section" aria-label="desk live">
      <div className="section-head">
        <h2>DESK</h2>
        {/* AWAYの正式表記はAWAY FROM SCREEN(2026-07-25 Andy)。スマホは頭の幅が
            足りないためAWAYに圧縮(語彙は同じ、長さだけ落とす=.ls-long) */}
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
        <div className={`scribe-window ${mode}`}>
          {mode === 'idle' && <div className="scribe-idle-date">{dateLabel}</div>}
          {/* ①サーバー描画用(JSを実行しない読み手向け)。JSが描いたら隠す */}
          <div
            className={`scribe-window-inner scribe-html${ready ? ' is-ssr-hidden' : ''}`}
            aria-hidden={ready || undefined}
            dangerouslySetInnerHTML={{ __html: serverBodyHtml(initialHtml) }}
          />
          {/* ②クライアントが書く器(innerHTMLを持たせない) */}
          <div className="scribe-window-inner scribe-html" ref={viewRef} />
        </div>
        {mode !== 'idle' && (
          <div className="scribe-window-foot">
            <span className="char-count">{charCount.toLocaleString('ja-JP')} 字</span>
            <Link href="/live">全文を読む →</Link>
          </div>
        )}
      </div>
    </section>
  )
}
