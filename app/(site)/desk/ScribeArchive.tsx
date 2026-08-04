'use client'

import { useEffect, useRef, useState } from 'react'
import { sanitizeNodes } from '@/lib/scribe/liveClient'
import { applyAnnotations } from '@/lib/site/annotate'
import { upgradeEmbeds } from '@/lib/site/upgradeEmbeds'
import AnnotationLayer from '../AnnotationLayer'
import type { Annotation, AnnotationTarget } from '@/lib/site/annotations'
import { serverBodyHtml } from '@/lib/site/serverBody'

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
  // JSが本文を描き終えたか(2026-07-29)。サーバー描画用の本文は「消さずに隠す」。
  // 同じ要素にdangerouslySetInnerHTMLを付けたままにすると、再描画のたびにReactが
  // それを貼り直してリッチ版(空行・注釈・画像)を潰す(Andy報告のバグ)。
  // 器を2つに分け、クライアントが書く器にはinnerHTMLを一切持たせない
  const [ready, setReady] = useState(false)

  // 本文の注入(+注釈の適用)。annotationsが変わったら貼り直す
  useEffect(() => {
    const root = ref.current
    if (!root) return
    root.replaceChildren(...sanitizeNodes(html))
    setReady(true)
    // 単独で貼られた埋め込み可能URLを再生カードへ(スマホ経由で素のリンクのまま
    // 入った分の救済。注釈の適用より先に行い、注釈がiframeを包まないようにする)
    upgradeEmbeds(root)
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

  return (
    <>
      {/* ①サーバー描画用の本文(2026-07-29)。JSを実行しない読み手(AIクローラー・
          テキスト抽出・エージェント)に空ページとして見えていたため。
          serverBodyHtmlは属性を出さず全てエスケープする=XSSの余地がない。
          JSが本文を描いたら**消さずに隠す**(Reactがここを貼り直しても実害がない) */}
      <div
        className={`scribe-html scribe-archive-body${ready ? ' is-ssr-hidden' : ''}`}
        aria-hidden={ready || undefined}
        dangerouslySetInnerHTML={{ __html: serverBodyHtml(html) }}
      />
      {/* ②クライアントが書く器。innerHTMLを一切持たせない=Reactが中身に触れない */}
      <div className="scribe-html scribe-archive-body" ref={ref} />

      <AnnotationLayer
        rootRef={ref}
        annotations={annotations}
        canEdit={canEdit}
        target={target}
      />
    </>
  )
}
