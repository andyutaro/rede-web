import { createService } from '@/lib/supabase/service'
import { cachedJson } from '@/lib/site/edgeCache'
import { assignedOf, listAllImages, shelfPathForType } from '@/lib/site/photos'
import { SHOWS } from './shows'
import { fetchShowFeed } from './podcastFeed'
import { firstImageSrc, scribeTitle, tokyoYmd } from './text'

// 「同じ頃の作品」(2026-07-28 Andy指定): 日付を鍵に、全ページを横断で結ぶ。
// ある日付の前後7日に生まれた他の仕事を出す。エピソードページの
// 「この頃のscribe」(2026-07-20)を全種類・全方向へ一般化したもの。
//
// 設計:
// - **厳密な同日にしない。** scribeは毎日・Physicalは年数回と頻度が違いすぎ、
//   同日一致だとPhysical/Photographyでは一生表示されない死んだ機能になる。
//   前後7日に幅を持たせ、各行に実際の日付を出す(日付が見えていれば嘘にならない)。
// - **同じ棚の項目は出さない。** 前後の移動はPagerの担当。ここは「他の仕事」の窓。
// - 表示は**Photography一覧と同じ画像グリッド**(2026-07-28 Andy指定)。
//   正方形タイル+3段ラベルの文法は棚と共通=新しい見た目を増やさない。
//
// 性能: 日付索引をエッジキャッシュに持つ(photoPoolと同じ手)。force-dynamicな
// ページからも、RSS5本とDB走査を毎回踏まずにJSON.parseだけで引ける。
const INDEX_TTL_SEC = 30 * 60
const WINDOW_DAYS = 7
const MAX_ITEMS = 6

export type SamePeriodItem = {
  date: string
  label: string // タイル下の種別(PODCAST / NOTES / PHOTOGRAPHY …)
  title: string
  href: string
  thumb: string | null
  assigned?: boolean // 充当サムネイル(本人の写真でない借り物)は淡く出す
}

let memo: { promise: Promise<SamePeriodItem[]>; ts: number } | null = null

function datedIndex(): Promise<SamePeriodItem[]> {
  if (memo && Date.now() - memo.ts < INDEX_TTL_SEC * 1000) return memo.promise
  const promise = cachedJson('dated-index-2', INDEX_TTL_SEC, buildIndex)
  memo = { promise, ts: Date.now() }
  return promise
}

// サムネイルの優先順位は棚の正典に合わせる(2026-07-10改訂):
// manual > 本文の最初の画像 > 保存済み > 充当。ここは索引なので焼き込みはしない
function resolveThumb(
  row: { html?: unknown; thumbnail_url?: unknown; thumbnail_source?: unknown },
  pool: string[],
  key: string
): { thumb: string | null; assigned: boolean } {
  const stored = (row.thumbnail_url as string | null) ?? null
  if (row.thumbnail_source === 'manual' && stored) return { thumb: stored, assigned: false }
  const first = firstImageSrc((row.html as string) ?? '')
  if (first) return { thumb: first, assigned: false }
  if (stored) return { thumb: stored, assigned: row.thumbnail_source === 'assigned' }
  const a = assignedOf(pool, key)
  return { thumb: a, assigned: a !== null }
}

async function buildIndex(): Promise<SamePeriodItem[]> {
  const service = createService()
  const [{ data: days }, { data: arts }, { data: manual }, feeds, pool] = await Promise.all([
    service
      .from('scribe_days')
      .select('date, html, thumbnail_url, thumbnail_source, finalized_at, deleted_at')
      .not('finalized_at', 'is', null),
    service
      .from('articles')
      .select('id, title, type, html, thumbnail_url, thumbnail_source, published_at, deleted_at')
      .eq('status', 'published'),
    service.from('manual_updates').select('date, label, body, href, deleted_at'),
    Promise.all(SHOWS.map((s) => (s.feed ? fetchShowFeed(s.feed, s.since) : Promise.resolve(null)))),
    listAllImages(),
  ])

  const items: SamePeriodItem[] = []

  for (const d of days ?? []) {
    if (d.deleted_at) continue
    const date = d.date as string
    const { thumb, assigned } = resolveThumb(d, pool, date)
    items.push({
      date,
      label: 'NOTES',
      title: `DESK『${scribeTitle(date)}』`,
      href: `/desk/${date}`,
      thumb,
      assigned,
    })
  }

  for (const a of arts ?? []) {
    if (a.deleted_at || !a.published_at) continue
    const title = ((a.title as string) ?? '').trim() || '無題'
    const type = a.type as string
    const date = tokyoYmd(a.published_at as string)
    const { thumb, assigned } = resolveThumb(a, pool, a.id as string)
    // 棚の対応表はphotos.tsのshelfPathForTypeが唯一の出所(2026-07-29)
    const shelf = shelfPathForType(type)
    const label =
      type === 'photography'
        ? 'PHOTOGRAPHY'
        : type === 'physical'
          ? 'PHYSICAL'
          : type === 'event'
            ? 'EVENTS'
            : 'NOTES'
    items.push({ date, label, title, href: `${shelf}/${a.id}`, thumb, assigned })
  }

  for (const m of manual ?? []) {
    if (m.deleted_at) continue
    items.push({
      date: m.date as string,
      label: ((m.label as string) || 'NEWS').toUpperCase(),
      title: (m.body as string) ?? '',
      href: (m.href as string | null) ?? '',
      thumb: null,
    })
  }

  SHOWS.forEach((s, i) => {
    const feed = feeds[i]
    if (!feed) return
    const showName = s.shortName ?? s.name
    for (const ep of feed.episodes) {
      items.push({
        date: ep.date,
        label: 'PODCAST',
        title: `${showName}『${ep.title.replace(/[！!\s　]+$/, '')}』`,
        href: `/podcast/${s.slug}/${ep.id}`,
        // 回のアートがあればそれ、無ければ番組カバー
        thumb: ep.image ?? feed.image ?? null,
      })
    }
  })

  return items
}

function daysApart(a: string, b: string): number {
  const ms = Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)
  return Math.abs(ms) / 86_400_000
}

// date: 基準日(YYYY-MM-DD)。excludePrefix: 同じ棚を外すためのhref接頭辞
// (例 '/desk/'、'/podcast/sakanakaigi/'、'/notes/')。
// 近い日付を優先し、同距離なら新しい順。最大6件。
export async function samePeriod(date: string, excludePrefix: string): Promise<SamePeriodItem[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return []
  let index: SamePeriodItem[]
  try {
    index = await datedIndex()
  } catch {
    return [] // 索引が引けなくてもページ本体は壊さない
  }
  return index
    .filter(
      (r) => r.href && !r.href.startsWith(excludePrefix) && daysApart(r.date, date) <= WINDOW_DAYS
    )
    .sort((a, b) => {
      const d = daysApart(a.date, date) - daysApart(b.date, date)
      return d !== 0 ? d : a.date < b.date ? 1 : -1
    })
    .slice(0, MAX_ITEMS)
}
