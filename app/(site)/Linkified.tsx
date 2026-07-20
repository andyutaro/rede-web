import type { ReactNode } from 'react'

// CMS駆動のプレーンテキスト段落(membership・番組ショーノート等)の中の素のURLを
// リンク化する。studioの編集はプレーンテキストなので、本文にURLを貼ると素の
// 文字列のまま表示されてリンクが死ぬ(2026-07-14 Andy指摘)。リンクは無彩色下線
// (§10: 彩色はLIVE赤のみ)。
//
// 2026-07-20拡張(ショーノートのリンク総点検):
// - 不可視文字(word joiner等)をURLに巻き込まない(scribe側liveClientと同じ規約)
// - プロトコルなしのドメイン表記(「Website：sakanakaigi.com」等)もリンク化する。
//   誤リンク化を避けるためTLDは番組概要欄に実在するものを中心の小さな許可リスト。
//   直前が英数・@・/・.の場合は除外(メールアドレスやURL内部の断片を拾わない)
const URL_RE =
  /https?:\/\/[^\s<>"'、。」』）】\u2060\u200b-\u200d\ufeff]+|(?<![\w.@/])(?:[a-z0-9-]+\.)+(?:com|jp|net|org|io|me|fm|gle|style|life)(?:\/[^\s<>"'、。」』）】\u2060\u200b-\u200d\ufeff]*)?/gi

export default function Linkified({ text }: { text: string }) {
  const nodes: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0]
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`
    nodes.push(
      <a key={m.index} className="prose-link" href={href} target="_blank" rel="noopener noreferrer">
        {url}
      </a>
    )
    last = m.index + url.length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return <>{nodes}</>
}
