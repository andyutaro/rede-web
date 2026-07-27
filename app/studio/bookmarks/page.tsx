import { createClient } from '@/lib/supabase/server'
import BookmarkList, { type BookmarkRow } from './BookmarkList'

export const dynamic = 'force-dynamic'

// BOOKMARKS室(2026-07-27 Andy指定): scribe/記事の本文に貼った外部リンクの索引。
// 「自分の文章に貼ったリンク=自分のブックマーク」。行の出所は夜間cronと
// 手動の再スキャン(本文がSSOT、ここは索引+リンク先タイトルのキャッシュ)。
export default async function StudioBookmarks() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('bookmarks')
    .select('*')
    .order('last_seen', { ascending: false })
    .order('url', { ascending: true })

  // テーブル未作成でも部屋ごと壊さない(SQL実行前の防御、他室と同じ流儀)
  if (error) {
    return (
      <>
        <h1 className="studio-h1">BOOKMARKS</h1>
        <p className="studio-note">
          テーブルがまだありません。Supabaseで db/2026-07-27-bookmarks.sql を実行してください。
        </p>
      </>
    )
  }

  const rows: BookmarkRow[] = (data ?? []).map((b) => ({
    url: b.url as string,
    domain: b.domain as string,
    title: (b.title as string | null) ?? null,
    fetched: Boolean(b.fetched_at),
    sources: (b.sources as BookmarkRow['sources']) ?? [],
    context: (b.context as string | null) ?? null,
    lastSeen: (b.last_seen as string | null) ?? '',
    hidden: Boolean(b.hidden),
  }))

  return (
    <>
      <h1 className="studio-h1">BOOKMARKS</h1>
      <BookmarkList rows={rows} />
    </>
  )
}
