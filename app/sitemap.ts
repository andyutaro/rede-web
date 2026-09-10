import type { MetadataRoute } from 'next'
import { SHOWS } from '@/lib/site/shows'
import { fetchShowFeedLight } from '@/lib/site/podcastFeed'
import { createService } from '@/lib/supabase/service'
import { listGuestRows } from '@/lib/site/guestEpisodes'

// sitemap.xml(2026-07-23): 検索エンジンにこのサイトの地図を渡す。
// ポッドキャスターのサイトで一番拾われてほしいのはエピソードページなので、
// 番組・エピソードは全て載せる。確定した日々の書き物(/desk/[date])・
// Notes/Photography/Physical/Eventsの各頁も。
// 非公開・私的な口(studio, /desk と /desk/about=執筆画面, live, search,
// 未確定の当日分)は載せない。
//
// 生成はRSSとDBを引くため、ISRと同じ30分でキャッシュする(毎リクエスト作らない)
export const revalidate = 1800

const BASE = 'https://andyutaro.com'

// 実在する公開ページ(app/(site)配下)。/liveは日々消える一時的な場所、
// /searchは道具なので地図には載せない
const STATIC_PATHS = [
  '',
  '/about',
  '/updates',
  '/podcast',
  '/notes',
  '/photography',
  '/physical',
  '/membership',
  '/mail',
  '/privacy',
] as const

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const service = createService()

  const [feeds, scribeRes, articleRes, guestRows] = await Promise.all([
    Promise.all(SHOWS.map((s) => (s.feed ? fetchShowFeedLight(s.feed, s.since) : null))),
    // 確定済み・未削除の日だけ(/desk/[date]が404を返さない日付)
    service
      .from('scribe_days')
      .select('date, finalized_at')
      .not('finalized_at', 'is', null)
      .is('deleted_at', null),
    service.from('articles').select('id, type, status, published_at, deleted_at'),
    // ゲスト出演(2026-09-10)。控えだけ読む=RSSを引かない(棚と同じくDB1本)
    listGuestRows(),
  ])

  const now = new Date()

  // 固定ページのlastModified(2026-09-10)。以前は全部「sitemapを生成した瞬間」で、
  // 30分ごとに全固定ページが「更新された」と申告していた。Googleは当てにならない
  // lastmodを無視するようになるので、**中身が本当に変わった日**だけを書く:
  //  ・Home / Updates … サイト全体で一番新しいもの(エピソード・Desk・記事・ゲスト回)
  //  ・Podcast … 一番新しいエピソード(自番組+ゲスト回)
  //  ・それ以外(About・Privacy等) … 分からないので書かない(書かないのは正しい)
  const ymd = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '')
  const latestEpisode = [
    ...feeds.map((f) => f?.latest ?? ''),
    ...guestRows.map((g) => g.date ?? ''),
  ].reduce((a, b) => (b > a ? b : a), '')
  const latestDesk = (scribeRes.data ?? [])
    .map((d) => ymd(d.finalized_at as string))
    .reduce((a, b) => (b > a ? b : a), '')
  const latestArticle = (articleRes.data ?? [])
    .filter((a) => a.status === 'published' && a.published_at && !a.deleted_at)
    .map((a) => ymd(a.published_at as string))
    .reduce((a, b) => (b > a ? b : a), '')
  const latestAny = [latestEpisode, latestDesk, latestArticle].reduce(
    (a, b) => (b > a ? b : a),
    ''
  )
  const lastModOf = (p: string): Date | undefined => {
    const d = p === '' || p === '/updates' ? latestAny : p === '/podcast' ? latestEpisode : ''
    return d ? new Date(d) : undefined
  }

  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({
    url: `${BASE}${p}`,
    lastModified: lastModOf(p),
    changeFrequency: p === '' || p === '/updates' ? 'daily' : 'monthly',
    priority: p === '' ? 1 : 0.7,
  }))

  SHOWS.forEach((show, i) => {
    const feed = feeds[i]
    if (!feed) return
    entries.push({
      url: `${BASE}/podcast/${show.slug}`,
      lastModified: feed.latest ? new Date(feed.latest) : now,
      changeFrequency: 'weekly',
      priority: 0.8,
    })
    for (const ep of feed.episodes) {
      entries.push({
        url: `${BASE}/podcast/${show.slug}/${ep.id}`,
        lastModified: new Date(ep.date),
        changeFrequency: 'yearly',
        priority: 0.6,
      })
    }
  })

  for (const d of scribeRes.data ?? []) {
    entries.push({
      url: `${BASE}/desk/${d.date}`,
      lastModified: new Date(d.finalized_at as string),
      changeFrequency: 'yearly',
      priority: 0.5,
    })
  }

  // Notes/Photography/Physicalは同じarticlesテーブルをtypeで分ける
  // (公開棚はNotesに改名済みだがDBのtypeは'article'のまま。
  //  eventは2026-08-07にPhysical棚へ統合、typeはeventのまま)
  const SHELF: Record<string, string> = {
    article: '/notes',
    photography: '/photography',
    physical: '/physical',
    event: '/physical',
  }
  for (const a of articleRes.data ?? []) {
    if (a.status !== 'published' || !a.published_at || a.deleted_at) continue
    const shelf = SHELF[a.type as string]
    if (!shelf) continue
    entries.push({
      url: `${BASE}${shelf}/${a.id}`,
      lastModified: new Date(a.published_at as string),
      changeFrequency: 'yearly',
      priority: 0.5,
    })
  }

  // ゲスト出演の回(2026-09-10)。自番組のエピソードと同じ扱い。日付はその回の公開日
  for (const g of guestRows) {
    if (!g.date) continue
    entries.push({
      url: `${BASE}/podcast/guest/${g.id}`,
      lastModified: new Date(g.date),
      changeFrequency: 'yearly',
      priority: 0.6,
    })
  }

  return entries
}
