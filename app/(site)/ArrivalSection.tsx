'use client'

import { useEffect, useState } from 'react'
import CreatureRow from './CreatureRow'
import { ARRIVED_EVENT, takeFinishedArrivals } from './arrivalSignal'

// 「今日来てくれた人」の節(2026-08-07)。
//
// 当日のページでは、リロードなしで並びが育つ(2026-08-12 Andy指定):
// 生きもの(自分のでも誰かのでも)が波形を渡り終えた瞬間、その絵がここに加わる。
// 泳ぎ切った魚が並びに収まる、という順序。サーバー描画の分には開いた時点までの
// 到着が載っているので、開いた後に生えたものだけを足して二重計上を避ける。
export default function ArrivalSection({
  kinds,
  label,
  live = false,
}: {
  kinds: number[]
  label: string
  live?: boolean
}) {
  const [own, setOwn] = useState<number[]>([])
  // このページを開いた時刻。サーバー描画の並びには、この時点までの到着が
  // 載っているので、これより後に生えたものだけを足せば二重にならない
  const [mountedAt] = useState(() => Date.now())

  useEffect(() => {
    if (!live) return // 過ぎた日の並びは、今日の到着で増えない
    // 合図が先に飛んでいても拾えるよう、まず置かれた値を取りに行く。
    // 値は取ると消えるので、後から来る合図と二重に足すことはない
    const take = () => {
      const kinds = takeFinishedArrivals(mountedAt)
      if (kinds.length > 0) setOwn((prev) => [...prev, ...kinds])
    }
    take()
    window.addEventListener(ARRIVED_EVENT, take)
    return () => window.removeEventListener(ARRIVED_EVENT, take)
  }, [live, mountedAt])

  const all = own.length > 0 ? [...kinds, ...own] : kinds
  if (all.length === 0) return null

  return (
    <section className="section arrival-section">
      <div className="section-head">
        <h2>{label}</h2>
      </div>
      <div className="section-body">
        <CreatureRow kinds={all} />
      </div>
    </section>
  )
}
