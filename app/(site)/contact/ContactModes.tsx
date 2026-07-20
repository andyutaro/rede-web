'use client'

import { useEffect, useState, type ReactNode } from 'react'

// CONTACT & OTAYORIのモード切替(2026-07-20)。開いた瞬間に「仕事の相談も
// 番組へのおたよりも送れる」と分かることが最重要要件のため、ページ冒頭に
// 2枚のタイルを置き、以降の内容を丸ごと切り替える。
// エピソードページの「この回への便り」(?ep=/?show=)から来た場合はおたより面で開く。
type Mode = 'work' | 'otayori'

export default function ContactModes({ work, otayori }: { work: ReactNode; otayori: ReactNode }) {
  const [mode, setMode] = useState<Mode>('work')

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- マウント時1回のURL→初期面の決定(SiteMenuと同前例)
    if (p.get('ep') || p.get('show') || p.get('mode') === 'otayori') setMode('otayori')
  }, [])

  return (
    <>
      <div className="mail-modes" role="tablist" aria-label="用件を選ぶ">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'work'}
          className={`mail-mode${mode === 'work' ? ' on' : ''}`}
          onClick={() => setMode('work')}
        >
          <span className="mm-en">FOR CLIENT</span>
          <span className="mm-ja">お仕事のご相談</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'otayori'}
          className={`mail-mode${mode === 'otayori' ? ' on' : ''}`}
          onClick={() => setMode('otayori')}
        >
          <span className="mm-en">FOR LISTENER</span>
          <span className="mm-ja">番組へのおたより</span>
        </button>
      </div>
      {mode === 'work' ? work : otayori}
    </>
  )
}
