// 注釈をDOMに結びつける処理(クライアント側、2026-07-28)。
// 本文HTMLは触らず、描画後のDOM上で引用範囲だけを<span>で包む。
// 包む対象はテキストノードの一部分だけなので、リンクや<br>の構造を壊さない。
//
// 座標は**本文全体(root)の先頭からの文字数**で持つ(2026-07-28改)。
// 当初はブロック単位に閉じていたが、「ここまでが一段落」という人の直感と
// DOMのブロック境界が一致せず、選べる範囲が不自由だった(Andy指摘)。
// root基準にしたことで段落をまたぐ選択がそのまま通り、包む処理は
// テキストノード単位なので境界を跨いでも構造を壊さない(spanが複数に分かれるだけ)。
import type { Annotation } from './annotations'

type Seg = { node: Text; start: number; end: number }

function textNodesIn(root: Element): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let n = walker.nextNode()
  while (n) {
    out.push(n as Text)
    n = walker.nextNode()
  }
  return out
}

// ある位置(コンテナ+オフセット)が、root先頭から何文字目かを返す。
// Rangeのテキスト長で測るのでコンテナが要素でもテキストでも同じ結果になる
// (textContentの連結と一致し、ブロック間に改行が入らない)
export function charOffsetIn(root: Element, container: Node, offsetInNode: number): number {
  try {
    const r = document.createRange()
    r.selectNodeContents(root)
    r.setEnd(container, offsetInNode)
    return r.toString().length
  } catch {
    return -1
  }
}

// 引用範囲を探す。保存時のオフセットに引用文字列があればそれを採り、
// ズレていれば本文中を探し直す(後から本文を編集しても迷子になりにくい)
function locate(root: Element, startOffset: number, quote: string): Seg[] | null {
  if (!quote) return null
  const nodes = textNodesIn(root)
  const full = nodes.map((n) => n.data).join('')
  let index = -1
  if (startOffset >= 0 && full.substr(startOffset, quote.length) === quote) {
    index = startOffset
  } else {
    index = full.indexOf(quote)
  }
  if (index < 0) return null

  const from = index
  const to = index + quote.length
  const segs: Seg[] = []
  let acc = 0
  for (const n of nodes) {
    const nodeStart = acc
    const nodeEnd = acc + n.length
    acc = nodeEnd
    if (nodeEnd <= from || nodeStart >= to) continue
    segs.push({
      node: n,
      start: Math.max(0, from - nodeStart),
      end: Math.min(n.length, to - nodeStart),
    })
  }
  return segs.length > 0 ? segs : null
}

function wrap(segs: Seg[], id: string) {
  for (const s of segs) {
    let node = s.node
    if (s.start > 0) node = node.splitText(s.start)
    if (node.length > s.end - s.start) node.splitText(s.end - s.start)
    const span = document.createElement('span')
    span.className = 'anno'
    span.dataset.annoId = id
    node.parentNode?.insertBefore(span, node)
    span.appendChild(node)
  }
}

// 適用できた注釈のIDを返す(返らなかったものは「迷子」=本文に出せなかった注釈)
export function applyAnnotations(root: HTMLElement, list: Annotation[]): Set<string> {
  const applied = new Set<string>()
  for (const a of list) {
    const segs = locate(root, a.startOffset, a.quote)
    if (!segs) continue
    wrap(segs, a.id)
    applied.add(a.id)
  }
  return applied
}

export type Anchor = { blockId: string; startOffset: number; quote: string }

// 選択範囲から保存用のアンカーを作る。長さも段落数も問わない。
// 既存の注釈と重なる選択だけは断る(同じ箇所に二重で引かない)。
export function anchorFromSelection(root: HTMLElement): { anchor: Anchor } | { error: string } {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    return { error: '注釈をつける範囲を選んでください' }
  }
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) {
    return { error: '本文の中で選んでください' }
  }

  // 二重引きの禁止(2026-07-28 Andy指定): 既存の注釈に少しでも掛かる選択は断る
  for (const el of Array.from(root.querySelectorAll('.anno'))) {
    if (range.intersectsNode(el)) {
      return { error: 'すでに注釈がある箇所には重ねられません' }
    }
  }

  const startOffset = charOffsetIn(root, range.startContainer, range.startOffset)
  const endOffset = charOffsetIn(root, range.endContainer, range.endOffset)
  if (startOffset < 0 || endOffset <= startOffset) {
    return { error: '注釈をつける範囲を選んでください' }
  }
  // 引用は「本文テキストの連結」から切り出す(選択文字列だと段落間の改行が
  // 混ざり、後で探し直す時に一致しなくなる)
  const quote = (root.textContent ?? '').slice(startOffset, endOffset)
  if (!quote.trim()) return { error: '注釈をつける範囲を選んでください' }
  if (quote.length > 500) return { error: '範囲が長すぎます(500文字まで)' }

  // 開始位置のブロックIDは参考として残す(位置決めはroot基準のオフセットが担う)
  const startEl =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement
  const blockId = (startEl?.closest('[data-block-id]') as HTMLElement | null)?.dataset.blockId ?? ''

  return { anchor: { blockId, startOffset, quote } }
}
