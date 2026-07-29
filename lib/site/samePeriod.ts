import { createService } from '@/lib/supabase/service'
import { cachedJson } from '@/lib/site/edgeCache'
import { SHOWS } from './shows'
import { fetchShowFeed } from './podcastFeed'
import { scribeTitle, tokyoYmd } from './text'
import type { UpdateRow } from './updates'

// 「同じ頃」(2026-07-28 Andy指定): 日付を鍵に、全ページを横断で結ぶ。
// ある日付の前後7日に生まれた他の仕事を出す。エピソードページの
// 「この頃のscribe」(2026-07-20)を全種類・全方向へ一般化したもの。
//
// 設計:
// - **厳密な同日にしない。** scribeは毎日・Physicalは年数回と頻度が違いすぎ、
//   同日一致だとPhysical/Photographyでは一生表示されない死んだ機能になる。
//   前後7日に幅を持たせ、各行に実際の日付を出す(日付が見えていれば嘘にならない)。
// - **同じ棚の項目は出さない。** 前後の移動はPagerの担当。ここは「他の仕事」の窓。
// - 表示はUPDATESと同じ行の文法(日付+ラベル+タイトル)を使い回す=新しい見た目を増やさない。
//
// 性能: 日付索引をエッジキャッシュに持つ(photoPoolと同じ手)。force-dynamicな
// ページからも、RSS5本とDB走査を毎回踏まずにJSON.parseだけで引ける。
const INDEX_TTL_SEC = 30 * 60
const WINDOW_DAYS = 7
const MAX_ROWS = 6

let memo: { promise: Promise<UpdateRow[]>; ts: number } | null = null

function datedIndex(): Promise<UpdateRow[]> {
  if (memo && Date.now() - memo.ts < INDEX_TTL_SEC * 1000) return memo.promise
  const promise = cachedJson('dated-index-1', INDEX_TTL_SEC, buildIndex)
  memo = { promise, ts: Date.now() }
  return promise
}

async function buildIndex(): Promise<UpdateRow[]> {
  const service = createService()
  const [{ data: days }, { data: arts }, { data: manual }, feeds] = await Promise.all([
    service
      .from('scribe_days')
      .select('date, finalized_at, deleted_at')
      .not('finalized_at', 'is', null),
    service
      .from('articles')
      .select('id, title, type, published_at, deleted_at')
      .eq('status', 'published'),
    service.from('manual_updates').select('date, label, body, href, deleted_at'),
    Promise.all(SHOWS.map((s) => (s.feed ? fetchShowFeed(s.feed, s.since) : Promise.resolve(null)))),
  ])

  const rows: UpdateRow[] = []

  for (const d of days ?? []) {
    if (d.deleted_at) continue
    const date = d.date as string
    rows.push({
      date,
      kind: 'scribe',
      label: 'NOTES',
      excerpt: `SCRIBE『${scribeTitle(date)}』`,
      href: `/scribe/${date}`,
    })
  }

  for (const a of arts ?? []) {
    if (a.deleted_at || !a.published_at) continue
    const title = ((a.title as string) ?? '').trim() || '無題'
    const type = a.type as string
    const date = tokyoYmd(a.published_at as string)
    if (type === 'photography') {
      rows.push({ date, kind: 'Photography', label: 'PHOTOGRAPHY', excerpt: `『${title}』`, href: `/photography/${a.id}` })
    } else if (type === 'physical') {
      rows.push({ date, kind: 'Physical', label: 'PHYSICAL', excerpt: `『${title}』`, href: `/physical/${a.id}` })
    } else {
      rows.push({ date, kind: 'Article', label: 'NOTES', excerpt: `ARTICLE『${title}』`, href: `/notes/${a.id}` })
    }
  }

  for (const m of manual ?? []) {
    if (m.deleted_at) continue
    rows.push({
      date: m.date as string,
      kind: 'News',
      label: ((m.label as string) || 'NEWS').toUpperCase(),
      excerpt: (m.body as string) ?? '',
      href: (m.href as string | null) ?? '',
    })
  }

  SHOWS.forEach((s, i) => {
    const feed = feeds[i]
    if (!feed) return
    const showName = s.shortName ?? s.name
    for (const ep of feed.episodes) {
      rows.push({
        date: ep.date,
        kind: 'Podcast',
        excerpt: `${showName}『${ep.title.replace(/[！!\s　]+$/, '')}』`,
        href: `/podcast/${s.slug}/${ep.id}`,
      })
    }
  })

  return rows
}

function daysApart(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)
  return Math.abs(ms) / 86_400_000
}

// date: 基準日(YYYY-MM-DD)。excludePrefix: 同じ棚を外すためのhref接頭辞
// (例 '/scribe/'、'/podcast/sakanakaigi/'、'/notes/')。
// 近い日付を優先し、同距離なら新しい順。最大6件。
export async function samePeriod(date: string, excludePrefix: string): Promise<UpdateRow[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
  let index: UpdateRow[]
  try {
    index = await datedIndex()
  } catch {
    return [] // 索引が引けなくてもページ本体は壊さない
  }
  return index
    .filter((r) => r.href && !r.href.startsWith(excludePrefix) && daysApart(r.date, date) <= WINDOW_DAYS)
    .sort((a, b) => {
      const d = daysApart(a.date, date) - daysApart(b.date, date)
      return d !== 0 ? d : a.date < b.date ? 1 : -1
    })
    .slice(0, MAX_ROWS)
}
