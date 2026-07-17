'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// 部屋の再編(2026-07-17): PHYSICAL/THUMBNAILS/PAGESはNOTES室のタブへ統合し、
// 上部メニューを10→7に(メニューが多すぎて目が散る問題への対応)。
// ARTICLESは公開棚の改名(→Notes)に追従してNOTESへ
const ROOMS = [
  { href: '/studio/notes', label: 'NOTES' },
  { href: '/studio/photography', label: 'PHOTOGRAPHY' },
  { href: '/studio/podcast', label: 'PODCAST INBOX' },
  { href: '/studio/updates', label: 'UPDATES' },
  { href: '/studio/tags', label: 'TAGS' },
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
