'use client'

import { useState } from 'react'

// 長文を「格納」できる開閉セクション(旧AboutのPROFILE/OVERVIEWのアコーディオンを踏襲)。
// トーンは開発中サイト側に合わせる: 無彩色・細罫線・小さなラベル・控えめな開閉記号。
export default function Accordion({
  label,
  defaultOpen = false,
  children,
}: {
  label: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={`accordion ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="accordion-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="accordion-label">{label}</span>
        <span className="accordion-mark" aria-hidden="true">
          {open ? '−' : '＋'}
        </span>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  )
}
