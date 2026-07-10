import Link from 'next/link'

export type PagerLink = {
  href: string
  title: string
} | null

// 個別ページ下部の「戻る・進む」ナビ(scribe/Article/Podcastエピソード共通)。
// 左=ひとつ古いもの、右=ひとつ新しいもの。タイトル付き・1行ellipsis。
export default function Pager({ older, newer }: { older: PagerLink; newer: PagerLink }) {
  if (!older && !newer) return null
  return (
    <nav className="pager" aria-label="前後のページ">
      {older ? (
        <Link href={older.href} className="pager-cell pager-older">
          <span className="pager-dir">← 前</span>
          <span className="pager-title">{older.title}</span>
        </Link>
      ) : (
        <span className="pager-cell" aria-hidden="true" />
      )}
      {newer ? (
        <Link href={newer.href} className="pager-cell pager-newer">
          <span className="pager-dir">次 →</span>
          <span className="pager-title">{newer.title}</span>
        </Link>
      ) : (
        <span className="pager-cell" aria-hidden="true" />
      )}
    </nav>
  )
}
