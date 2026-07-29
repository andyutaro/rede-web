// 注釈をDOMに結びつける処理(クライアント側、2026-07-28)。
// 本文HTMLは触らず、描画後のDOM上で引用範囲だけを<span>で包む。
// 包む対象はテキストノードの一部分だけなので、リンクや<br>の構造を壊さない。
import type { Annotation } from './annotations'

type Seg = { node: Text; start: number; end: number }

function textNodesIn(block: Element): Text[] {
  const out: Text[] = []
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let n = walker.nextNode()
  while (n) {
    out.push(n as Text)
    n = walker.nextNode()
  }
  return out
}

// ブロック内の位置(ノード+ノード内オフセット)を、ブロック先頭からの文字数に直す
export function charOffsetIn(block: Element, target: Node, offsetInNode: number): number {
  let acc = 0
  for (const t of textNodesIn(block)) {
    if (t === target) return acc + offsetInNode
    acc += t.length
  }
  return -1
}

// 引用範囲を探す。オフセットの位置に引用文字列があればそれを採り、
// ズレていれば本文中を探し直す(後から本文を編集しても迷子になりにくい)
function locate(block: Element, startOffset: number, quote: string): Seg[] | null {
  if (!quote) return null
  const nodes = textNodesIn(block)
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
    const block = a.blockId
      ? root.querySelector(`[data-block-id="${CSS.escape(a.blockId)}"]`)
      : null
    // ブロックが見つからない場合は本文全体から引用を探す(ブロックIDが変わった時の保険)
    const scope = block ?? root
    const segs = locate(scope, block ? a.startOffset : -1, a.quote)
    if (!segs) continue
    wrap(segs, a.id)
    applied.add(a.id)
  }
  return applied
}

// 選択範囲から保存用のアンカーを作る。ブロックをまたぐ選択は受け付けない
// (注釈は一箇所を指すもの。またぐ場合はブロック内に収めてもらう)
export function anchorFromSelection(
  root: HTMLElement
): { blockId: string; startOffset: number; quote: string } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  const quote = sel.toString().trim()
  if (!quote) return null
  if (!root.contains(range.commonAncestorContainer)) return null

  const startEl =
    range.startContainer.nodeType === Node.ELEMENT_NODE
      ? (range.startContainer as Element)
      : range.startContainer.parentElement
  const block = startEl?.closest('[data-block-id]')
  const endEl =
    range.endContainer.nodeType === Node.ELEMENT_NODE
      ? (range.endContainer as Element)
      : range.endContainer.parentElement
  if (!block || endEl?.closest('[data-block-id]') !== block) return null

  const startOffset = charOffsetIn(block, range.startContainer, range.startOffset)
  if (startOffset < 0) return null
  return { blockId: (block as HTMLElement).dataset.blockId ?? '', startOffset, quote }
}
