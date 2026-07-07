import { createService } from '@/lib/supabase/service'
import { scribeTitle } from './text'
import { SHOWS } from './shows'
import { fetchShowFeed } from './podcastFeed'

// 更新リストの1行: 日付+ラベル+タイトル。
// scribeはタイトル=日付導出(20260706)、Podcastはラベル=番組名/タイトル=『…』配信、
// Article/Photographyはラベルのみ。labelが無ければkindを大文字表示。
export type UpdateRow = {
  date: string // YYYY-MM-DD
  kind: 'scribe' | 'Article' | 'Photography' | 'Podcast'
  label?: string // ラベル列の表示を上書き(Podcast=番組名など)
  excerpt?: string // タイトル列
  href: string
}

// 「新しく生まれたものだけが流れる」: 対象は日次scribe確定・published記事・新エピソード着信。
// エピソードの"誕生"はpubDate。編集ではpubDateが変わらないため再掲されない(原則に合致)。
// compact: HomeのLAST 10 DAYS用。Podcastはエピソードタイトルを入れず「番組名『New EP has Released』」に。
export async function recentUpdates(limit = 10, compact = false): Promise<UpdateRow[]> {
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
    // scribeはArticle配下なのでラベル=ARTICLE。タイトルは「SCRIBE『20260706』」
    label: 'ARTICLE',
    excerpt: `SCRIBE『${scribeTitle(d.date as string)}』`,
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
    const showName = s.shortName ?? s.name // 「ロングポスト」等の自然な番組名
    for (const ep of feed.episodes.slice(0, limit)) {
      // ラベル=PODCAST(kind由来)。compact(Home)はエピソードタイトルを入れず新着表記のみ。
      // 通常(/updates)はタイトルを『』内に(末尾の！等の強調記号だけ落とす、？は残す)。
      const title = ep.title.replace(/[！!\s　]+$/, '')
      rows.push({
        date: ep.date,
        kind: 'Podcast',
        excerpt: compact ? `${showName}『New EP has Released』` : `${showName}『${title}』`,
        href: `/podcast/${s.slug}/${ep.id}`,
      })
    }
  })

  rows.sort((a, b) => (a.date < b.date ? 1 : -1))
  return rows.slice(0, limit)
}
