'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV } from './nav'

// ヘッダーはContactを出さない(右上の固定ピルが担う、2026-07-12)。
// フッターは全項目(includeContact=true)。
export default function NavLinks({ includeContact = true }: { includeContact?: boolean }) {
  const pathname = usePathname()
  const items = includeContact ? NAV : NAV.filter((n) => n.href !== '/contact')
  return (
    <nav className="site-nav">
      {items.map(({ label, href }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? 'page' : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  )
}
