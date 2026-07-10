'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// 部屋は仕様で5つ(Articles/Podcast Inbox/Updates/Thumbnails/Tags)。
// 初回実装はArticlesとPodcast Inbox、残り3つはメニューだけ置く(骨格)。
const ROOMS = [
  { href: '/studio/articles', label: 'ARTICLES' },
  { href: '/studio/photography', label: 'PHOTOGRAPHY' },
  { href: '/studio/podcast', label: 'PODCAST INBOX' },
] as const

const SOON = ['UPDATES', 'THUMBNAILS', 'TAGS'] as const

export default function StudioNav() {
  const pathname = usePathname()
  return (
    <nav className="studio-nav">
      {ROOMS.map((r) => (
        <Link key={r.href} href={r.href} aria-current={pathname.startsWith(r.href) ? 'page' : undefined}>
          {r.label}
        </Link>
      ))}
      {SOON.map((label) => (
        <span key={label} className="nav-soon" title="後で実装">
          {label}
        </span>
      ))}
    </nav>
  )
}
