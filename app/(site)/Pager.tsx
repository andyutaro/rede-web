import Link from 'next/link'

export type PagerLink = {
  href: string
  title: string
} | null

// 個別ページ下部の「戻る・進む」ナビ(scribe/Notes/Photography/Podcastエピソード共通)。
// 左=ひとつ古いもの、中央=一覧に戻る、右=ひとつ新しいもの。タイトル付き・1行ellipsis。
export default function Pager({
  older,
  newer,
  back,
}: {
  older: PagerLink
  newer: PagerLink
  back?: PagerLink
}) {
  if (!older && !newer && !back) return null
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
      {back && (
        <Link href={back.href} className="pager-cell pager-back">
          <span className="pager-dir">一覧に戻る</span>
          <span className="pager-title">{back.title}</span>
        </Link>
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
