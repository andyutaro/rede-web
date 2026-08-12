// 到着した生きものを、同じ画面の「今日来てくれた人」へ渡すための細い管。
//
// 2026-08-12改: 並びが増えるのは「生きものが画面を渡り終えた瞬間」(Andy指定)。
// 泳ぎ切った魚が、下の並びに加わる。自分のものも他の誰かのものも同じ扱い。
//
// イベントだけで渡すと、節が水和される前に合図が飛んで取りこぼす(実際に
// 取りこぼした)ので、値を置いてから合図する。受け手が先でも後でも拾える。
//
// spawnedAt(エポックms)を持つのは二重計上を避けるため: ページを開いた時の
// サーバー描画には、その時点までにDBへ入った到着が既に載っている。だから
// 「自分がこのページに来た後に生えたもの」だけを後から足せば、重ならない。
type Finished = { kind: number; spawnedAt: number }

let queue: Finished[] = []

export const ARRIVED_EVENT = 'andy:arrived'

export function pushFinishedArrival(kind: number, spawnedAt: number) {
  queue.push({ kind, spawnedAt })
  window.dispatchEvent(new CustomEvent(ARRIVED_EVENT))
}

// since(エポックms)以降に生えたものだけを返し、キューを空にする。
// 古いもの(前のページ滞在中に生えたもの)はサーバー描画側に載っているので捨てる
export function takeFinishedArrivals(since: number): number[] {
  const takeable = queue.filter((f) => f.spawnedAt >= since)
  queue = []
  return takeable.map((f) => f.kind)
}
