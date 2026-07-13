import Link from 'next/link'

// PAGES室(2026-07-13): 固定ページの文章編集。Contact/Membership/Privacyはsite_content駆動。
// Aboutはレイアウトがある専用エディタ(/desk/about)なのでそこへ誘導する。
const PAGES = [
  { key: 'contact', label: 'CONTACT', href: '/studio/pages/contact' },
  { key: 'membership', label: 'MEMBERSHIP', href: '/studio/pages/membership' },
  { key: 'privacy', label: 'PRIVACY POLICY', href: '/studio/pages/privacy' },
]

export default function StudioPages() {
  return (
    <>
      <h1 className="studio-h1">PAGES</h1>
      <div>
        {PAGES.map((p) => (
          <div className="studio-row" key={p.key}>
            <Link className="row-title" href={p.href}>
              {p.label}
            </Link>
          </div>
        ))}
        <div className="studio-row">
          <Link className="row-title" href="/desk/about">
            ABOUT（専用エディタ →/desk/about）
          </Link>
        </div>
      </div>
    </>
  )
}
