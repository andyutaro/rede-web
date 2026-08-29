import { cachedJson } from '@/lib/site/edgeCache'
import { createService } from '@/lib/supabase/service'
import { fetchShowFeedLight } from './podcastFeed'
import { showBySlug, type Show } from './shows'

// PODCASTピルの連続再生キュー(2026-08-29)。
//
// **なぜ夜に作り置きするのか。** これは全ページ共通のレイアウトが読むもので、
// 以前は毎回RSSを3本取ってその場で組んでいた。実測すると冷えた拠点で
// 「2.97MBのXMLを復号(4.9ms)+パース(1.8ms)」がかかり、無料枠のCPU 10msを
// ページ描画と合わせて超えていた。超えると**キャッシュの書き込みも完了しない**ので
// その拠点は永久に温まらない=悪循環。実際に7日で8,190件の
// 「Failed to revalidate stale page」が出ていた(2026-08-29にダッシュボードで確認)。
//
// 作り置きなら 87KB / 0.19ms。**35分の1の重さで同じものが出せる。**
//
// 代償は「新しい回が抽選に入るのが最大1日遅れる」ことだけ。キューは5〜8時間ぶんの
// 中から10本引く仕組みなので、1本の有無は事実上わからない(2026-08-29 Andy承認)。
// 抽選は**表示のたびに**行うので、訪問ごとに順番が変わる従来の挙動は変わらない。
export const HERO_SLUGS = ['onairdo', 'mimoriradio', 'sakanakaigi'] as const

// 保存する形。再生に要る分だけ持つ(概要欄・画像・検索テキストは持たない)
export type HeroTrack = {
  slug: string
  id: string
  title: string
  date: string
  audioUrl: string
}

const CONTENT_KEY = 'hero_queue'
const POOL_TTL_SEC = 30 * 60

// 夜のcronが呼ぶ。RSSから組んでsite_contentへ置く
export async function buildHeroPool(): Promise<{ count: number; error?: string }> {
  try {
    const shows = HERO_SLUGS.map(showBySlug).filter((s): s is Show => !!s?.feed)
    const feeds = await Promise.all(shows.map((s) => fetchShowFeedLight(s.feed!, s.since)))
    const pool: HeroTrack[] = []
    feeds.forEach((feed, i) => {
      for (const ep of feed?.episodes ?? []) {
        if (!ep.audioUrl) continue
        pool.push({
          slug: shows[i].slug,
          id: ep.id,
          title: ep.title,
          date: ep.date,
          audioUrl: ep.audioUrl,
        })
      }
    })
    if (pool.length === 0) return { count: 0, error: 'プールが空(取得失敗の可能性)' }
    const service = createService()
    const { error } = await service
      .from('site_content')
      .upsert({ key: CONTENT_KEY, data: pool, updated_at: new Date().toISOString() })
    if (error) return { count: pool.length, error: error.message }
    return { count: pool.length }
  } catch (e) {
    return { count: 0, error: e instanceof Error ? e.message : String(e) }
  }
}

// 読む側。拠点キャッシュを前段に置く(photoPool・samePeriodと同じ手)
export function heroPool(): Promise<HeroTrack[]> {
  return cachedJson('hero-queue-1', POOL_TTL_SEC, async () => {
    const service = createService()
    const { data } = await service
      .from('site_content')
      .select('data')
      .eq('key', CONTENT_KEY)
      .maybeSingle()
    const pool = data?.data
    return Array.isArray(pool) ? (pool as HeroTrack[]) : []
  })
}

// 番組を跨いだラウンドロビンで n 本引く(既存 randomEpisodeQueue と同じ手つき:
// 番組順をシャッフルし、各番組から重複なく1本ずつ取っていく)
export function pickQueue(pool: HeroTrack[], n = 10): HeroTrack[] {
  const bySlug = new Map<string, HeroTrack[]>()
  for (const t of pool) {
    const list = bySlug.get(t.slug)
    if (list) list.push(t)
    else bySlug.set(t.slug, [t])
  }
  const groups = [...bySlug.values()].filter((g) => g.length > 0)
  if (groups.length === 0) return []
  for (let i = groups.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[groups[i], groups[j]] = [groups[j], groups[i]]
  }
  const out: HeroTrack[] = []
  const used = groups.map(() => new Set<number>())
  while (out.length < n) {
    let picked = false
    for (let g = 0; g < groups.length && out.length < n; g++) {
      const group = groups[g]
      if (used[g].size >= group.length) continue
      let k
      do {
        k = Math.floor(Math.random() * group.length)
      } while (used[g].has(k))
      used[g].add(k)
      out.push(group[k])
      picked = true
    }
    if (!picked) break // 全番組の在庫切れ
  }
  return out
}
