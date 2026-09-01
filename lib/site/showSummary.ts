import { cachedJson } from '@/lib/site/edgeCache'
import { createService } from '@/lib/supabase/service'
import { fetchShowFeedLight } from './podcastFeed'
import { SHOWS } from './shows'

// 番組の要約を夜に作り置く(2026-09-01)。連続再生キュー(heroQueue)と同じ手を
// カバーと更新欄にも広げる。
//
// **なぜ。** Homeの描画は番組RSSを二重に取っていた——カバーと最新日付で
// channelInfo()を番組数ぶん、UPDATESでfetchShowFeedLight()をもう一度番組数ぶん。
// 5番組で往復10本。ここにSupabase・写真プール・ISRキャッシュのR2読み書きが乗って、
// **1リクエストあたりのサブリクエスト上限(50本)を越えて描画が落ちていた**。
// 落ちると作り直しキューが6回リトライし、それも落ちる。2026-08-31から9-01に
// かけて「revalidation failed after 6 retries」20,067件・
// 「Too many subrequests」16,410件が出て、Supabaseへ1日46,000リクエストが飛んだ。
// 読者には古いページが配られ続けるので、外からは何も壊れて見えなかった。
//
// 作り置きなら往復10本が1本(しかも拠点キャッシュの前段つき)になる。
// 代償はheroQueueと同じ「新しい回が出るのが最大1日遅れる」ことだけ。
export type ShowSummary = {
  slug: string
  image: string | null
  latest: string | null
  episodes: { id: string; title: string; date: string }[]
}

const CONTENT_KEY = 'show_summary'
const TTL_SEC = 30 * 60
// UPDATESが番組ごとに使うのは先頭limit件。実測では/updates(直近100件)に
// 載るのが番組あたり最大8件なので、まとめて出た週でも切れないよう24件持つ
const EP_KEEP = 24

// RSSから組む。夜のcronと、作り置きがまだ無いときの自己回復の両方が使う
async function buildFromFeeds(): Promise<ShowSummary[]> {
  const feeds = await Promise.all(
    SHOWS.map((s) => (s.feed ? fetchShowFeedLight(s.feed, s.since) : Promise.resolve(null)))
  )
  return SHOWS.map((s, i) => {
    const feed = feeds[i]
    return {
      slug: s.slug,
      image: feed?.image ?? null,
      latest: feed?.latest ?? null,
      episodes: (feed?.episodes ?? []).slice(0, EP_KEEP).map((ep) => ({
        id: ep.id,
        title: ep.title,
        date: ep.date,
      })),
    }
  })
}

async function save(rows: ShowSummary[]): Promise<string | undefined> {
  const service = createService()
  const { error } = await service
    .from('site_content')
    .upsert({ key: CONTENT_KEY, data: rows, updated_at: new Date().toISOString() })
  return error?.message
}

// 夜のcronが呼ぶ
export async function buildShowSummary(): Promise<{ count: number; error?: string }> {
  try {
    const rows = await buildFromFeeds()
    // 全部空=取得に失敗している。古い作り置きを空で潰さない
    if (!rows.some((r) => r.episodes.length > 0 || r.image)) {
      return { count: 0, error: '要約が空(RSS取得失敗の可能性)' }
    }
    const error = await save(rows)
    return { count: rows.length, error }
  } catch (e) {
    return { count: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

// **同じ描画の中で二度読まないための共有(photos.tsと同じ手)。** Homeは
// カバー側とUPDATES側の両方からこれを呼ぶ。Promiseごと持たないと、冷えたisolateで
// 両方がキャッシュを外し、作り置きが無い場合はRSSの組み立てまで二重に走る
// =減らしたはずのサブリクエストが倍に戻る
let memo: { promise: Promise<ShowSummary[]>; ts: number } | null = null

// 読む側。拠点キャッシュ(30分)→site_contentの1行。
// まだ作り置きが無ければその場でRSSから組んで置く(自己回復)。
// これが無いと、導入直後〜最初のcronまでHomeが番組を出せない
export function showSummaries(): Promise<ShowSummary[]> {
  if (memo && Date.now() - memo.ts < TTL_SEC * 1000) return memo.promise
  const promise = loadSummaries()
  memo = { promise, ts: Date.now() }
  return promise
}

function loadSummaries(): Promise<ShowSummary[]> {
  return cachedJson('show-summary-1', TTL_SEC, async () => {
    const service = createService()
    const { data } = await service
      .from('site_content')
      .select('data')
      .eq('key', CONTENT_KEY)
      .maybeSingle()
    const rows = data?.data
    if (Array.isArray(rows) && rows.length > 0) return rows as ShowSummary[]
    const built = await buildFromFeeds()
    // 書き込みに失敗しても描画は続ける(次の誰かが作り直すだけ)
    try {
      await save(built)
    } catch {
      /* noop */
    }
    return built
  })
}

export function summaryOf(rows: ShowSummary[], slug: string): ShowSummary | null {
  return rows.find((r) => r.slug === slug) ?? null
}
