'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

// MAILピル(2026-08-01改称、旧MAIL/旧Contact): 中の言葉がCONTACTとOTAYORIに
// 周期的に入れ替わる(Andy指定)。「MAIL」の一語では仕事の相談とおたよりの
// 両方の入口だと分からないため、畳んでいた二語をそのまま出して交互に見せる。
// 遷移先はどちらも/contact(=挙動に差を付けない、Andy指定)。
// 切替は横のスライド(Andy指定)。ワードマークの肩書き(フェード)とは別の運動にして、
// 二つが同時に画面にあっても同じ拍で動いて見えないようにする。
const WORDS = ['CONTACT', 'OTAYORI'] as const
const INTERVAL = 3600 // ワードマーク(3000)と割り切れない値にして拍を重ねない

export default function MailPill() {
  const [i, setI] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % WORDS.length), INTERVAL)
    return () => clearInterval(id)
  }, [])

  return (
    <Link
      href="/mail"
      className="contact-pill"
      aria-label="Contact & Otayori — お仕事のご相談・番組へのおたより"
    >
      {/* 読み上げは切替と無関係に一定にする(aria-labelが担う)ので中身は装飾扱い。
          横に並べた語をまとめてずらす=窓に次の語が横から入ってくる */}
      <span className="cp-roll" aria-hidden="true">
        {/* トラックは窓の語数ぶんの幅を持ち、1語がちょうど窓1つぶん。
            transformの%はトラック自身の幅基準なので、1語ぶん=100/語数 で刻む。
            寸法はすべてWORDS.lengthから出す(CSS側に語数を書かない) */}
        <span
          className="cp-track"
          style={{
            width: `${WORDS.length * 100}%`,
            transform: `translateX(${(-i * 100) / WORDS.length}%)`,
          }}
        >
          {WORDS.map((w) => (
            <span key={w} className="cp-word" style={{ flexBasis: `${100 / WORDS.length}%` }}>
              {w}
            </span>
          ))}
        </span>
      </span>
    </Link>
  )
}
