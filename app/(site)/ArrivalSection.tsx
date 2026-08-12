'use client'

import { useEffect, useState } from 'react'
import CreatureRow from './CreatureRow'
import { ARRIVED_EVENT, takeOwnArrival } from './arrivalSignal'

// 「今日来てくれた人」の節(2026-08-07)。
//
// サーバーが描いた時点の分だけを出すと、自分の到着が自分の画面に出ない:
// ページのHTMLが先に届き、到着の記録はその700ms後に走るため、
// その日の最初の一人は初回に何も見えず、開き直して初めて現れる
// (2026-08-12にAndyが「消えた」と気づいた挙動の片方)。
// 当日のページでは、自分の到着を受け取ってその場で並びに足す。
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

  useEffect(() => {
    if (!live) return // 過ぎた日の並びは、今日の到着で増えない
    // 合図が先に飛んでいても拾えるよう、まず置かれた値を取りに行く。
    // 値は取ると消えるので、後から来る合図と二重に足すことはない
    const take = () => {
      const kind = takeOwnArrival()
      if (kind != null) setOwn((prev) => [...prev, kind])
    }
    take()
    window.addEventListener(ARRIVED_EVENT, take)
    return () => window.removeEventListener(ARRIVED_EVENT, take)
  }, [live])

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
