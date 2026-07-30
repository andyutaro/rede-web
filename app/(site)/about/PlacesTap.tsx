'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// Aboutの集約地図の「押せる」層(2026-07-30 Andy指摘)。
// 「いいデザインゆえに、地名やその赤丸をタップしたくなる。しかしタップしても
// 何も起きない」。押したらその土地の番組が分かるようにする。
//
// 番組ページへは飛ばさない(Andy明示)。地図を見ている流れを切らずに、
// 「ここで何をやっているか」だけを静かに見せる=注釈ポップアップと同じ作法。
//
// 地図そのもの(PlaceMap)はサーバーコンポーネントのまま。ここは器だけを
// クライアントにして、中のSVGに付いたdata-place属性を頼りに開閉を受ける。
// こうするとJSはこの小さな器の分だけで済み、番組ページには一切送られない。
export default function PlacesTap({
  shows,
  children,
}: {
  // 地名 → その土地の番組名(Aboutに載っている番組だけ。未公開番組は含めない)
  shows: Record<string, string[]>
  children: React.ReactNode
}) {
  const [open, setOpen] = useState<{ label: string; x: number; y: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  const openAt = useCallback((el: Element) => {
    const label = el.getAttribute('data-place') ?? ''
    if (!label) return
    const r = el.getBoundingClientRect()
    setOpen({ label, x: r.left + r.width / 2, y: r.bottom })
  }, [])

  // Escで閉じる(注釈ポップアップと同じ)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // スクロールしたら閉じる(fixed配置なので、追従させずに畳むのが素直)
  useEffect(() => {
    if (!open) return
    const onScroll = () => setOpen(null)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [open])

  const names = open ? (shows[open.label] ?? []) : []

  // 画面外にはみ出さないよう寄せる。windowを触るのは開いた後=クライアントだけ
  // (コンポーネント本体で読むとサーバー描画で落ちる。2026-07-28に踏んだ罠)
  const pos = () => {
    if (!open) return undefined
    const w = 220
    const left = Math.max(12, Math.min(open.x - w / 2, window.innerWidth - w - 12))
    return { left, top: Math.min(open.y + 10, window.innerHeight - 120), width: w }
  }

  return (
    <div
      ref={ref}
      className="places-tap"
      onClick={(e) => {
        const el = (e.target as Element).closest?.('[data-place]')
        if (el) openAt(el)
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return
        const el = (e.target as Element).closest?.('[data-place]')
        if (!el) return
        e.preventDefault()
        openAt(el)
      }}
    >
      {children}
      {open && names.length > 0 && (
        <>
          {/* 外側をタップで閉じる。暗幕は張らない=静かに開く */}
          <div className="anno-veil" onClick={() => setOpen(null)} aria-hidden="true" />
          <div className="place-pop" style={pos()} role="dialog" aria-label={open.label}>
            <p className="place-pop-name">{open.label}</p>
            <ul className="place-pop-shows">
              {names.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
