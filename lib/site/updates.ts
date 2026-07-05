import { createService } from '@/lib/supabase/service'
import { excerpt } from './text'

// 更新リストの1行(handoff-notes §4): 日付+種別ラベル+(scribeのみ)冒頭抜粋。
// タイトル欄は存在しない(scribeにタイトルはない)。
export type UpdateRow = {
  date: string // YYYY-MM-DD
  kind: 'scribe' | 'Article' | 'Photography'
  excerpt?: string
  href: string
}

// 「新しく生まれたものだけが流れる」: 対象は日次scribe確定とpublished記事。
export async function recentUpdates(limit = 10): Promise<UpdateRow[]> {
  const service = createService()

  const { data: days } = await service
    .from('scribe_days')
    .select('date, html, finalized_at')
    .not('finalized_at', 'is', null)
    .order('date', { ascending: false })
    .limit(limit)

  const rows: UpdateRow[] = (days ?? []).map((d) => ({
    date: d.date as string,
    kind: 'scribe',
    excerpt: excerpt((d.html as string) ?? ''),
    href: `/scribe/${d.date}`,
  }))

  // articlesテーブルはマイグレーション後に有効になる(未作成ならerrorで空のまま)
  const { data: articles, error } = await service
    .from('articles')
    .select('id, type, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit)

  if (!error) {
    for (const a of articles ?? []) {
      if (!a.published_at) continue
      rows.push({
        date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(
          new Date(a.published_at as string)
        ),
        kind: a.type === 'photography' ? 'Photography' : 'Article',
        href: '/article',
      })
    }
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  return rows.slice(0, limit)
}
