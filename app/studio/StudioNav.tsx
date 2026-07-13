'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// 部屋は仕様の5つ+Photography独立室(2026-07-10)。全室実装済み(2026-07-11)
const ROOMS = [
  { href: '/studio/articles', label: 'ARTICLES' },
  { href: '/studio/photography', label: 'PHOTOGRAPHY' },
  { href: '/studio/physical', label: 'PHYSICAL' },
  { href: '/studio/podcast', label: 'PODCAST INBOX' },
  { href: '/studio/updates', label: 'UPDATES' },
  { href: '/studio/thumbnails', label: 'THUMBNAILS' },
  { href: '/studio/tags', label: 'TAGS' },
  { href: '/studio/pages', label: 'PAGES' },
  { href: '/studio/contact', label: 'CONTACT' },
  { href: '/studio/usage', label: 'USAGE' },
] as const

export default function StudioNav() {
  const pathname = usePathname()
  return (
    <nav className="studio-nav">
      {ROOMS.map((r) => (
        <Link key={r.href} href={r.href} aria-current={pathname.startsWith(r.href) ? 'page' : undefined}>
          {r.label}
        </Link>
      ))}
    </nav>
  )
}
