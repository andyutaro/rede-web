'use client'

import { useEffect, useRef } from 'react'
import { sanitizeNodes } from '@/lib/scribe/liveClient'

// エピソード概要欄。RSSのdescription(外部由来HTML)をscribeと同じ
// ホワイトリスト・サニタイザに通して表示する。AI要約はしない。
export default function EpisodeNotes({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.replaceChildren(...sanitizeNodes(html))
  }, [html])

  return <div className="scribe-html episode-notes" ref={ref} />
}
