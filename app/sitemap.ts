import type { MetadataRoute } from 'next'
import { SHOWS } from '@/lib/site/shows'
import { fetchShowFeedLight } from '@/lib/site/podcastFeed'
import { createService } from '@/lib/supabase/service'

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
  '/events',
  '/membership',
  '/contact',
  '/privacy',
] as const

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const service = createService()

  const [feeds, scribeRes, articleRes] = await Promise.all([
    Promise.all(SHOWS.map((s) => (s.feed ? fetchShowFeedLight(s.feed, s.since) : null))),
    // 確定済み・未削除の日だけ(/desk/[date]が404を返さない日付)
    service
      .from('scribe_days')
      .select('date, finalized_at')
      .not('finalized_at', 'is', null)
      .is('deleted_at', null),
    service.from('articles').select('id, type, status, published_at, deleted_at'),
  ])

  const now = new Date()
  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({
    url: `${BASE}${p}`,
    lastModified: now,
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
  // (公開棚はNotesに改名済みだがDBのtypeは'article'のまま)
  const SHELF: Record<string, string> = {
    article: '/notes',
    photography: '/photography',
    physical: '/physical',
    event: '/events',
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

  return entries
}
