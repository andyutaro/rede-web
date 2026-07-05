'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { NAV } from './nav'

export default function NavLinks() {
  const pathname = usePathname()
  return (
    <nav className="site-nav">
      {NAV.map(({ label, href }) => (
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
