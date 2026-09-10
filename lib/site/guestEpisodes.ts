// ゲスト出演(2026-09-10 Andy指定)。Andyが他番組に出た回をPodcast棚のGUEST群に載せる。
//
// 入力はSpotifyのエピソードURL1本だけ。そこから最後まで自動で辿る:
//   ① Spotify URL → og:title(回名) / og:description("番組名 · Episode")
//   ② 番組名 → iTunes Search API → feedUrl
//   ③ feedUrl → RSS → 回名で突き合わせ → guid・音源・日付・尺・カバー
//
// 本体はRSSが真実(episode_tagsと同じ)。DBが持つのはfeedUrl+guid+送客URL+控えだけ。
//
// **Spotify埋め込みは使わない**(2026-09-04検証): 非ログイン訪問者にはプレビューしか
// 鳴らず、紫のカードとロゴが入る(彩色はLIVE赤のみの原則と衝突)。RSSのenclosureなら
// 全編鳴り、自分の番組のエピソードページと同じ器に載る。

import { createService } from '@/lib/supabase/service'
import { fetchShowFeed, fetchShowFeedLight, type Episode } from '@/lib/site/podcastFeed'

export type GuestRow = {
  id: string
  feedUrl: string
  guid: string
  spotifyUrl: string | null
  // 控え(RSSが引けないときの代替表示)
  showName: string
  title: string
  date: string | null
  duration: string | null
}

// 棚・ページで使う解決済みの1件。epがnullならRSSから引けなかった=控えで出す
export type GuestEpisode = {
  id: string
  spotifyUrl: string | null
  showName: string
  title: string
  date: string
  duration: string | null
  image: string | null
  audioUrl: string | null
  description: string // 生HTML。表示側でサニタイズ
  feedUrl: string
  guid: string
}

// **UAで返るものが変わる**(2026-09-10 実測)。フルのChrome UAを送ると
// SPAの殻だけが返ってog:*が1つも無い。素朴なUA(リンクプレビュー系)を送ると
// メタ入りのHTMLが返る。ここは後者。他社のbotを名乗らず、素性を書いておく
const UA = 'Mozilla/5.0 (compatible; andyutaro.com link preview; +https://andyutaro.com)'

function metaContent(html: string, property: string): string | null {
  // og:xxx は property= と name= の両方があり得る。属性の順序も固定ではない
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']|` +
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
    'i'
  )
  const m = html.match(re)
  const raw = m?.[1] ?? m?.[2]
  return raw ? decodeHtmlEntities(raw) : null
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

// 突き合わせ用の正規化。Spotify側とRSS側で全角/半角・空白・記号が揺れるため、
// 英数字と仮名漢字だけ残して比べる
function normalizeTitle(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　]/g, '')
    .replace(/[!-/:-@[-`{-~、。「」『』・…—–ー－]/g, '')
}

export function spotifyEpisodeId(url: string): string | null {
  const m = url.match(/open\.spotify\.com\/(?:intl-[a-z]+\/)?episode\/([A-Za-z0-9]+)/)
  return m ? m[1] : null
}

// ① Spotifyのエピソードページから回名と番組名を取る
export async function readSpotifyEpisode(
  url: string
): Promise<{ title: string; showName: string } | null> {
  const id = spotifyEpisodeId(url)
  if (!id) return null
  try {
    const res = await fetch(`https://open.spotify.com/episode/${id}`, {
      headers: { 'user-agent': UA, 'accept-language': 'ja,en;q=0.8' },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const html = await res.text()
    const title = metaContent(html, 'og:title')
    // og:description は「聴く『新しい理科』 · Episode」の形。左側が番組名
    const desc = metaContent(html, 'og:description') ?? ''
    const showName = desc.split('·')[0].trim()
    if (!title || !showName) return null
    return { title, showName }
  } catch {
    return null
  }
}

// ② 番組名からRSSを引く。Apple(iTunes Search API)は番組名でfeedUrlを返す
export async function findFeedByShowName(showName: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(showName)
    const res = await fetch(
      `https://itunes.apple.com/search?term=${q}&entity=podcast&country=JP&limit=10`,
      { cache: 'no-store' }
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      results?: { collectionName?: string; feedUrl?: string }[]
    }
    const results = (data.results ?? []).filter((r) => r.feedUrl)
    if (results.length === 0) return null
    const want = normalizeTitle(showName)
    // 完全一致を最優先。無ければ部分一致、それも無ければ先頭
    const exact = results.find((r) => normalizeTitle(r.collectionName ?? '') === want)
    const partial = results.find((r) => {
      const got = normalizeTitle(r.collectionName ?? '')
      return got.includes(want) || want.includes(got)
    })
    return (exact ?? partial ?? results[0]).feedUrl ?? null
  } catch {
    return null
  }
}

// ③ フィードの中から回を特定する
export function matchEpisode(episodes: Episode[], title: string): Episode | null {
  const want = normalizeTitle(title)
  return (
    episodes.find((e) => normalizeTitle(e.title) === want) ??
    episodes.find((e) => {
      const got = normalizeTitle(e.title)
      return got.includes(want) || want.includes(got)
    }) ??
    null
  )
}

// CSPのmedia-srcはホスト列挙(next.config.ts、2026-07-30に`https:`から絞った)。
// **列挙に無いホストの音源は無音で失敗する**(要素は出るが鳴らない)。
// 自分の番組は全部Anchorなので足りていたが、ゲスト出演は先方の配信基盤次第。
// ここで判定してstudioのプレビューに出す=貼った時点で気づける
const ALLOWED_AUDIO_HOSTS = ['anchor.fm', 'd3ctxlq1ktw2nl.cloudfront.net']

export function audioHostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

export function audioHostAllowed(url: string | null): boolean {
  const host = audioHostOf(url)
  return host ? ALLOWED_AUDIO_HOSTS.includes(host) : false
}

export type ResolveResult =
  | { ok: true; feedUrl: string; guid: string; showName: string; ep: Episode }
  | { ok: false; step: 'spotify' | 'feed' | 'episode'; message: string }

// Spotify URL(またはRSS直指定)から1件を解決する。studioのプレビューと保存の両方が使う
export async function resolveGuestEpisode(input: {
  spotifyUrl?: string
  feedUrl?: string
  title?: string
}): Promise<ResolveResult> {
  let feedUrl = input.feedUrl?.trim() || ''
  let title = input.title?.trim() || ''
  let showName = ''

  if (input.spotifyUrl) {
    const meta = await readSpotifyEpisode(input.spotifyUrl)
    if (!meta) {
      return {
        ok: false,
        step: 'spotify',
        message: 'SpotifyのURLから回名・番組名を読めなかった（URLを確認するか、RSSを直接貼る）',
      }
    }
    title = title || meta.title
    showName = meta.showName
  }

  if (!feedUrl) {
    if (!showName) {
      return { ok: false, step: 'feed', message: '番組名が分からないためRSSを探せない' }
    }
    const found = await findFeedByShowName(showName)
    if (!found) {
      return {
        ok: false,
        step: 'feed',
        message: `「${showName}」のRSSが見つからなかった（Spotify独占配信の可能性。RSSを直接貼る）`,
      }
    }
    feedUrl = found
  }

  const feed = await fetchShowFeed(feedUrl)
  if (!feed) return { ok: false, step: 'feed', message: 'RSSを取得できなかった' }

  const ep = title ? matchEpisode(feed.episodes, title) : feed.episodes[0]
  if (!ep) {
    return { ok: false, step: 'episode', message: `RSSの中に「${title}」が見つからなかった` }
  }
  return { ok: true, feedUrl, guid: ep.id, showName: showName || feed.title, ep }
}

// 保存済みの行を読む。並びは**エピソードの公開日降順**(2026-09-10 Andy指定。
// 「サイトに追加した日順」ではない)。RSS側の日付が正なので、解決後にもう一度並べ直す
export async function listGuestRows(): Promise<GuestRow[]> {
  const service = createService()
  const { data } = await service
    .from('guest_episodes')
    .select('id, feed_url, episode_guid, spotify_url, show_name, title, published_at, duration')
    .is('deleted_at', null)
    .order('published_at', { ascending: false })
  return (data ?? []).map((r) => ({
    id: r.id as string,
    feedUrl: r.feed_url as string,
    guid: r.episode_guid as string,
    spotifyUrl: (r.spotify_url as string | null) ?? null,
    showName: (r.show_name as string) ?? '',
    title: (r.title as string) ?? '',
    date: (r.published_at as string | null) ?? null,
    duration: (r.duration as string | null) ?? null,
  }))
}

// 棚用: 題名・日付・カバーだけ要るので軽量フィードで足りる
export async function listGuestEpisodes({ full = false } = {}): Promise<GuestEpisode[]> {
  const rows = await listGuestRows()
  if (rows.length === 0) return []

  // 同じ番組に複数回出ている場合、フィードは1回だけ引く(podcastFeed側でも
  // in-flight共有されるが、ここで畳んでおくと意図が読める)
  const feedUrls = [...new Set(rows.map((r) => r.feedUrl))]
  const feeds = await Promise.all(
    feedUrls.map((u) => (full ? fetchShowFeed(u) : fetchShowFeedLight(u)))
  )
  const feedByUrl = new Map(feedUrls.map((u, i) => [u, feeds[i]]))

  const out: GuestEpisode[] = []
  for (const r of rows) {
    const feed = feedByUrl.get(r.feedUrl) ?? null
    const ep = feed?.episodes.find((e) => e.id === r.guid) ?? null
    // RSSが引けなければ控えで出す(フィードから回が落ちても棚から消えない)
    const date = ep?.date ?? r.date
    if (!date) continue
    out.push({
      id: r.id,
      spotifyUrl: r.spotifyUrl,
      showName: feed?.title || r.showName,
      title: ep?.title || r.title,
      date,
      duration: ep?.duration ?? r.duration,
      image: ep?.image ?? feed?.image ?? null,
      audioUrl: ep?.audioUrl ?? null,
      description: ep?.description ?? '',
      feedUrl: r.feedUrl,
      guid: r.guid,
    })
  }
  out.sort((a, b) => b.date.localeCompare(a.date))
  return out
}

export async function getGuestEpisode(id: string): Promise<GuestEpisode | null> {
  const all = await listGuestEpisodes({ full: true })
  return all.find((g) => g.id === id) ?? null
}
