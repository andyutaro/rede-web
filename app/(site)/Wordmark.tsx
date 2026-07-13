'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// ワードマーク「Andy 〔 … 〕」。Andyの活動はPodcasterだけではないので、
// 肩書きを時間ごとに切り替える(2026-07-13)。切替はフェード(サイトの静けさに準拠)。
// 全ラベルをグリッドの同セルに重ねて置く=幅は最長ラベルに固定 → 〔 〕の幅は切替と無関係に不動。
const ROLES = ['Podcaster', 'Photographer', 'Multi Director', 'Author', 'a human'] as const

export default function Wordmark() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % ROLES.length), 3000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="wordmark">
      <Link href="/">
        Andy
        <span className="wm-role">
          〔{' '}
          <span className="wm-rotator">
            {ROLES.map((r, k) => (
              <span key={r} className={`wm-role-item${k === i ? ' on' : ''}`} aria-hidden={k !== i}>
                {r}
              </span>
            ))}
          </span>{' '}
          〕
        </span>
      </Link>
    </div>
  )
}
