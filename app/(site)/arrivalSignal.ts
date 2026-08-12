// 自分の到着を、同じ画面の「今日来てくれた人」へ渡すための細い管(2026-08-12)。
//
// ページのHTMLは到着の記録より前に描かれるので、サーバーが渡す並びには
// 自分の分が入っていない。イベントだけで渡すと、下の方の節が水和される前に
// 合図が飛んで取りこぼす(実際に取りこぼした)。値を置いてから合図するので、
// 受け手が先でも後でも拾える。
//
// 値は一度取ったら消える。次にそのページを開き直した時はサーバーの並びに
// 自分の分が入っているため、二重に数えない。
let ownKind: number | null = null

export const ARRIVED_EVENT = 'andy:arrived'

export function markArrived(kind: number) {
  ownKind = kind
  window.dispatchEvent(new CustomEvent(ARRIVED_EVENT))
}

export function takeOwnArrival(): number | null {
  const k = ownKind
  ownKind = null
  return k
}
