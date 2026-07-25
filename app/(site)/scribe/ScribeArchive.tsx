'use client'

import { useEffect, useRef } from 'react'
import { sanitizeNodes } from '@/lib/scribe/liveClient'

// 確定アーカイブの本文表示。ライブと同じホワイトリスト・サニタイザを通す
// (アーカイブは確定テキストなのでキャレット・差分適用は不要)。
//
// #p=<ファイル名> が付いていたら、その写真まで自動スクロール(2026-07-25)。
// PHOTOLOGの「タップで掲載ページの当該箇所へ」の受け側。本文はこのコンポーネントが
// マウント後に注入するため、ブラウザ標準のフラグメント移動は使えない=自前で送る。
// 上方の画像が後から読み込まれると位置がずれるので、対象画像のloadでも送り直す。
export default function ScribeArchive({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    root.replaceChildren(...sanitizeNodes(html))

    const m = window.location.hash.match(/^#p=(.+)$/)
    if (!m) return
    const name = decodeURIComponent(m[1])
    const target = Array.from(root.querySelectorAll('img')).find((img) =>
      img.src.endsWith(`/${name}`)
    )
    if (!target) return
    const jump = () => target.scrollIntoView({ block: 'center' })
    jump()
    if (!target.complete) target.addEventListener('load', jump, { once: true })
  }, [html])

  return <div className="scribe-html scribe-archive-body" ref={ref} />
}
