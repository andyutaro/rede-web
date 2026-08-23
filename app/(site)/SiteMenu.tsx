'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NAV } from './nav'
import MenuSearch from './MenuSearch'

// メニュー(2026-07-12): ヘッダーの横並びナビを畳み、右上のMENUボタンに格納。
// 押すとページがうっすら覆われ、ナビが右上から縦一列にスッと出る。もう一度押すと
// ボタンの中へ格納される。Contactは専用ピルが担うのでメニューには載せない。
//
// 2026-08-23: **エピソード検索をこの中に入れた**(Andy指定)。トップの表面に
// 検索バーを常設せずに「あの回どれだっけ」を解くため。ボタンの語もMENUとSEARCHで
// 入れ替える(MAILピルと同じ作法)=中に検索があることが閉じていても伝わる。
const BUTTON_WORDS = ['MENU', 'SEARCH'] as const
const BUTTON_INTERVAL = 4400 // ワードマーク3000・MAILピル3600と割り切れない値
export default function SiteMenu() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [word, setWord] = useState(0)
  const items = NAV.filter((n) => n.href !== '/mail')

  // 閉じている間だけ語を入れ替える(開いている間はCLOSE固定)
  useEffect(() => {
    if (open) return
    const id = setInterval(() => setWord((v) => (v + 1) % BUTTON_WORDS.length), BUTTON_INTERVAL)
    return () => clearInterval(id)
  }, [open])

  // ページ遷移で閉じる(戻る/進む等、リンク以外の遷移も拾う安全網)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(false)
  }, [pathname])

  // 開いている間は背面スクロールを止める
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [open])

  // Escで閉じる
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        className={`menu-toggle${open ? ' open' : ''}`}
        onClick={() => {
          // 開くとき、背景のランダム再生を止める(WaveformHeroが受けて表示ごと閉じる)
          if (!open) window.dispatchEvent(new CustomEvent('andy:menu-open'))
          setOpen(!open)
        }}
        aria-expanded={open}
        aria-label="メニュー・エピソード検索"
      >
        {open ? (
          'CLOSE'
        ) : (
          // 読み上げはaria-labelが担うので中身は装飾扱い(MAILピルと同じ)。
          // 横に並べた語をまとめてずらす=窓に次の語が横から入ってくる
          <span className="cp-roll" aria-hidden="true">
            <span
              className="cp-track"
              style={{
                width: `${BUTTON_WORDS.length * 100}%`,
                transform: `translateX(${(-word * 100) / BUTTON_WORDS.length}%)`,
              }}
            >
              {BUTTON_WORDS.map((w) => (
                <span key={w} className="cp-word" style={{ flexBasis: `${100 / BUTTON_WORDS.length}%` }}>
                  {w}
                </span>
              ))}
            </span>
          </span>
        )}
      </button>

      {/* 開閉はインラインで駆動(カスケード依存を避け確実に効かせる)。
          transition/レイアウトはCSS側 */}
      <div
        className="site-menu"
        aria-hidden={!open}
        style={{
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          pointerEvents: open ? 'auto' : 'none',
        }}
        onClick={(e) => {
          // 余白(リンク以外)をタップしたら閉じる
          if (e.target === e.currentTarget) setOpen(false)
        }}
      >
        {/* ナビ項目の中央に検索(2026-08-23 Andy指定)。開いた瞬間に入口が真ん中にある */}
        <MenuSearch onNavigate={() => setOpen(false)} />
        <nav className="site-menu-nav">
          {items.map(({ label, href }, i) => (
            <Link
              key={href}
              href={href}
              className="site-menu-link"
              style={{
                opacity: open ? 1 : 0,
                transform: open ? 'translateX(0)' : 'translateX(14px)',
                transitionDelay: open ? `${0.04 * i + 0.06}s` : '0s',
              }}
              aria-current={pathname === href ? 'page' : undefined}
              onClick={() => setOpen(false)}
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  )
}
