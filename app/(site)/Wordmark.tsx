'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// ワードマーク「Andy 〔 … 〕」。肩書きを時間ごとに切り替える(2026-07-13)。
// 切替はフェード(サイトの静けさに準拠)。全ラベルをグリッドの同セルに重ねて置く=
// 幅は最長ラベルに固定 → 〔 〕の幅は切替と無関係に不動。
//
// 2026-08-25 Andy指定で2語に絞る(Director・Photographerを外す)。肩書きを並べる
// 見せ方から、ここが何の場所かを言う見せ方へ。表記も「Home🏠」→「HomePage🏠」
// (2026-07-13の「ホームページは和製英語なのでHome表記」はここで取り下げ。
//  about本文で「オフィシャルサイトではなくホームページ=家」と言い直したのと同じ線)
const ROLES = ['HomePage🏠', 'Podcaster'] as const

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
