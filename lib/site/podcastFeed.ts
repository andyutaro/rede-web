// 番組RSS(Anchor)のフルパース。カバー・最新日付(Home)とエピソード索引・
// エピソードページ(Podcast棚)のデータ源はすべてここ。LISTENは使わない(2026-07-05 Andy指定)。
//
// - カバーは<item>より前(channel部分)の<itunes:image>=番組全体のアート
// - エピソードIDはlink末尾のAnchor episode ID(…-eXXXX)。無ければguid先頭8文字
// - descriptionは生HTMLのまま持ち、表示側で必ずサニタイザ(liveClient)を通す
//   (RSSは外部由来文字列。エスケープ必須の原則)
// - AI要約はしない。RSSのdescriptionをそのまま表示する

export type Episode = {
  id: string
  title: string
  date: string // YYYY-MM-DD (東京)
  description: string // 生HTML。表示側でサニタイズ
  image: string | null
  link: string | null // 外部リスニングページ(遷移ボタンの行き先)
  audioUrl: string | null // enclosureのMP3(ネイティブ再生プレイヤー用)
  duration: string | null
}

export type ShowFeed = {
  title: string
  description: string // channel説明(プレーンテキスト)
  image: string | null
  latest: string | null // 最新エピソードの日付
  episodes: Episode[] // 逆時系列(フィード順)
}

const TTL_MS = 30 * 60 * 1000 // 新エピソードが30分以内にサイトへ反映される

// サーバーインスタンス内キャッシュ(Nextのデータキャッシュ併用)。
// フィードは全話分で数百KB〜になるため、リクエストごとの再取得・再パースを避ける。
// Promiseを入れる=同時リクエスト(layoutのヒーロー+ページ本体等)が同じフィードを
// 重複fetch+重複パースしない(in-flight共有)。sinceはキャッシュキーに含める。
const cache = new Map<string, { promise: Promise<ShowFeed | null>; ts: number }>()

// since: この日付(東京, YYYY-MM-DD)より前のエピソードを捨てる。
// 同じAnchor枠で旧番組が配信されていた場合の混入除去(例: BrandShiftは新シリーズ
// #001=2026-03-10以降のみ。それ以前は別番組がこの枠を使っていた)。
export function fetchShowFeed(feedUrl: string, since?: string): Promise<ShowFeed | null> {
  const key = since ? `${feedUrl}#${since}` : feedUrl
  const hit = cache.get(key)
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.promise
  const promise = loadFeed(feedUrl, since)
  cache.set(key, { promise, ts: Date.now() })
  return promise
}

async function loadFeed(feedUrl: string, since?: string): Promise<ShowFeed | null> {
  let feed: ShowFeed | null = null
  try {
    const res = await fetch(feedUrl, { next: { revalidate: 1800 } })
    if (res.ok) {
      feed = parseFeed(await res.text())
      if (feed && since) {
        const episodes = feed.episodes.filter((e) => e.date >= since)
        feed = { ...feed, episodes, latest: episodes[0]?.date ?? null }
      }
    }
  } catch {
    // フィード到達不可: null(表示側はその番組を出さない/エピソードなし扱い)
  }
  return feed
}

// 背景PODCAST連続再生のキューを作る(2026-07-19)。
// 番組の当たりやすさを話数に依存させないため、シャッフルした番組順の
// ラウンドロビンで各番組からランダムに未使用の1本ずつ取る(番組選択は均等)。
// enclosureを持つエピソードのみ。Math.randomはここに閉じる(render純粋性)。
export function randomEpisodeQueue(
  feeds: (ShowFeed | null)[],
  n = 10
): { feedIndex: number; episode: Episode }[] {
  const pools = feeds
    .map((feed, feedIndex) => ({
      feedIndex,
      eps: (feed?.episodes ?? []).filter((e) => e.audioUrl),
    }))
    .filter((c) => c.eps.length > 0)
  if (!pools.length) return []

  // 番組順をシャッフル(Fisher–Yates)
  for (let i = pools.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pools[i], pools[j]] = [pools[j], pools[i]]
  }

  const queue: { feedIndex: number; episode: Episode }[] = []
  const used = pools.map(() => new Set<number>())
  while (queue.length < n) {
    let picked = false
    for (let p = 0; p < pools.length && queue.length < n; p++) {
      const pool = pools[p]
      if (used[p].size >= pool.eps.length) continue
      let k
      do {
        k = Math.floor(Math.random() * pool.eps.length)
      } while (used[p].has(k))
      used[p].add(k)
      queue.push({ feedIndex: pool.feedIndex, episode: pool.eps[k] })
      picked = true
    }
    if (!picked) break // 全番組の在庫切れ
  }
  return queue
}

// Homeのカバー+最新日付用の薄いラッパー
export async function channelInfo(
  feedUrl: string,
  since?: string
): Promise<{ image: string | null; latest: string | null }> {
  const feed = await fetchShowFeed(feedUrl, since)
  return { image: feed?.image ?? null, latest: feed?.latest ?? null }
}

// channel説明はプレーンテキストとして描画するため、基本エンティティをここで解く
// (エピソードdescriptionは生HTMLのままサニタイザに渡すので対象外)。
// &amp;は最後(先に解くと&amp;lt;が二重デコードされる)
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
}

function unwrapCdata(s: string): string {
  const m = s.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)
  return (m ? m[1] : s).trim()
}

function tagText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))
  return m ? unwrapCdata(m[1]) : null
}

function httpsUrl(url: string | null): string | null {
  return url && /^https:\/\//i.test(url) ? url : null
}

// フォーマッタ生成は高コストなのでモジュールで1回だけ(パースはエピソード数ぶん呼ぶ)
const TOKYO_YMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' })

function toTokyoDate(pubDate: string | null): string | null {
  if (!pubDate) return null
  const d = new Date(pubDate)
  if (Number.isNaN(d.getTime())) return null
  return TOKYO_YMD.format(d)
}

function parseFeed(xml: string): ShowFeed {
  const [head, ...itemChunks] = xml.split(/<item[\s>]/i)

  const image = httpsUrl(
    head.match(/<itunes:image[^>]*\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ??
      head.match(/<image>[\s\S]*?<url>\s*([^<\s]+)\s*<\/url>/i)?.[1] ??
      null
  )

  const episodes: Episode[] = []
  for (const chunk of itemChunks) {
    const item = chunk.split(/<\/item>/i)[0]
    const link = httpsUrl(tagText(item, 'link'))
    const guid = tagText(item, 'guid')
    // Anchorのlink末尾「…-eXXXX」が安定した短いIDになる
    const id = link?.match(/-(e[a-z0-9]+)\/?$/i)?.[1] ?? guid?.replace(/-/g, '').slice(0, 8)
    const title = tagText(item, 'title')
    const date = toTokyoDate(tagText(item, 'pubDate'))
    if (!id || !title || !date) continue
    episodes.push({
      id,
      title: decodeEntities(title),
      date,
      description: tagText(item, 'description') ?? '',
      image: httpsUrl(item.match(/<itunes:image[^>]*\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? null),
      link,
      audioUrl: httpsUrl(item.match(/<enclosure[^>]*\burl\s*=\s*["']([^"']+)["']/i)?.[1] ?? null),
      duration: tagText(item, 'itunes:duration'),
    })
  }

  return {
    title: decodeEntities(tagText(head, 'title') ?? ''),
    description: decodeEntities(tagText(head, 'description') ?? ''),
    image,
    latest: episodes[0]?.date ?? null,
    episodes,
  }
}
