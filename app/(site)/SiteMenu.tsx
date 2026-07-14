'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { NAV } from './nav'

// メニュー(2026-07-12): ヘッダーの横並びナビを畳み、右上のMENUボタンに格納。
// 押すとページがうっすら覆われ、ナビが右上から縦一列にスッと出る。もう一度押すと
// ボタンの中へ格納される。Contactは専用ピルが担うのでメニューには載せない。
export default function SiteMenu() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const items = NAV.filter((n) => n.href !== '/contact')

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
        aria-label="メニュー"
      >
        {open ? 'CLOSE' : 'MENU'}
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
