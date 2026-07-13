import type { ReactNode } from 'react'

// CMS駆動のプレーンテキスト段落(membership等)の中の素のURLをリンク化する。
// studioの編集はプレーンテキストなので、本文にURLを貼ると素の文字列のまま
// 表示されてリンクが死ぬ(2026-07-14 Andy指摘)。URL規約はscribe側の
// liveClient(linkifyText)と同一。リンクは無彩色下線(§10: 彩色はLIVE赤のみ)。
const URL_RE = /https?:\/\/[^\s<>"'、。」』）】]+/g

export default function Linkified({ text }: { text: string }) {
  const nodes: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0]
    if (m.index > last) nodes.push(text.slice(last, m.index))
    nodes.push(
      <a key={m.index} className="prose-link" href={url} target="_blank" rel="noopener noreferrer">
        {url}
      </a>
    )
    last = m.index + url.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return <>{nodes}</>
}
