import { createService } from '@/lib/supabase/service'
import { excerpt } from './text'
import { SHOWS } from './shows'
import { fetchShowFeed } from './podcastFeed'

// 更新リストの1行(handoff-notes §4): 日付+種別ラベル+抜粋。
// scribeは冒頭抜粋、Podcastはエピソードタイトル(タイトルを持つため)、Article/Photographyはラベルのみ。
export type UpdateRow = {
  date: string // YYYY-MM-DD
  kind: 'scribe' | 'Article' | 'Photography' | 'Podcast'
  excerpt?: string
  href: string
}

// 「新しく生まれたものだけが流れる」: 対象は日次scribe確定・published記事・新エピソード着信。
// エピソードの"誕生"はpubDate。編集ではpubDateが変わらないため再掲されない(原則に合致)。
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

  // 各番組の直近エピソード(RSS)。フィードは番組ページ等と共有キャッシュ。
  // sinceで旧番組の混入を除去(BrandShift)。マージ後にlimitで切るので各番組はlimit件で十分。
  const feeds = await Promise.all(
    SHOWS.map((s) => (s.feed ? fetchShowFeed(s.feed, s.since) : Promise.resolve(null)))
  )
  SHOWS.forEach((s, i) => {
    const feed = feeds[i]
    if (!feed) return
    for (const ep of feed.episodes.slice(0, limit)) {
      rows.push({
        date: ep.date,
        kind: 'Podcast',
        excerpt: ep.title,
        href: `/podcast/${s.slug}/${ep.id}`,
      })
    }
  })

  rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  return rows.slice(0, limit)
}
