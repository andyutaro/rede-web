// 単独で貼られた埋め込み可能URLを、表示時に再生カードへ昇格させる(2026-07-28)。
//
// 背景: 放送卓のペースト処理(HtmlEditorのonPaste)がカード化を担っているが、
// スマホの入力経路では貼り付けがpasteイベントを通らないことがあり、素のリンクの
// まま本文に入る(Andy報告: スマホからSpotifyのリンクを貼ると再生ボックスにならない)。
//
// **入力経路に依存しない直し方**として、表示側で昇格させる。
// 表示側のサニタイザが既に「素URLをリンク化」しているのと同じ層の仕事であり、
// SSOT(本文HTML)には手を触れない=過去のアーカイブも遡って直る。
//
// 対象は「そのブロックの中身が単独のURLだけ」の場合に限る(文中のURLは触らない)。
import { embedConfigFor, isBareUrl } from '@/lib/scribe/embed'

export function upgradeEmbeds(root: HTMLElement) {
  // 入れ子ブロックの巻き添えを避けるため、末端のブロックだけを対象にする
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-block-id]')).filter(
    (b) => !b.querySelector('[data-block-id]')
  )
  // ブロックIDを持たない古い構造のため、rootの直下も見る
  for (const child of Array.from(root.children)) {
    const el = child as HTMLElement
    if (el.hasAttribute('data-block-id') || el.querySelector('[data-block-id]')) continue
    blocks.push(el)
  }

  for (const block of blocks) {
    if (block.querySelector('iframe')) continue // すでにカード
    const text = (block.textContent ?? '').trim()
    if (!isBareUrl(text)) continue
    const cfg = embedConfigFor(text)
    if (!cfg) continue

    const wrap = document.createElement('div')
    wrap.className = 'embed-podcast'
    const iframe = document.createElement('iframe')
    iframe.src = cfg.src
    iframe.height = String(cfg.height)
    iframe.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture')
    iframe.setAttribute('loading', 'lazy')
    wrap.appendChild(iframe)
    block.replaceChildren(wrap)
  }
}
