'use client'

import { useEffect, useRef } from 'react'
import { sanitizeNodes } from '@/lib/scribe/liveClient'

// 確定アーカイブの本文表示。ライブと同じホワイトリスト・サニタイザを通す
// (アーカイブは確定テキストなのでキャレット・差分適用は不要)。
export default function ScribeArchive({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.replaceChildren(...sanitizeNodes(html))
  }, [html])

  return <div className="scribe-html scribe-archive-body" ref={ref} />
}
