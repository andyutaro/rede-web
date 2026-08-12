// 番組RSS(Anchor)のフルパース。カバー・最新日付(Home)とエピソード索引・
// エピソードページ(Podcast棚)のデータ源はすべてここ。LISTENは使わない(2026-07-05 Andy指定)。
//
// - カバーは<item>より前(channel部分)の<itunes:image>=番組全体のアート
// - エピソードIDはlink末尾のAnchor episode ID(…-eXXXX)。無ければguid先頭8文字
// - descriptionは生HTMLのまま持ち、表示側で必ずサニタイザ(liveClient)を通す
//   (RSSは外部由来文字列。エスケープ必須の原則)
// - AI要約はしない。RSSのdescriptionをそのまま表示する

import { htmlToPlainText } from '@/lib/site/text'

export type Episode = {
  id: string
  title: string
  date: string // YYYY-MM-DD (東京)
  description: string // 生HTML。表示側でサニタイズ
  // 検索用プレーンテキスト(先頭600字)。表示毎にhtmlToPlainTextを全話分
  // 回すとCPU制限(下記)に効くため、パース時に1回だけ計算して持つ
  searchText: string
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
// 重複fetch+重複パースしない(in-flight共有)。キーはfeedUrlのみ(全話を持ち、
// sinceの絞り込みは取り出し時に行う=安価)。
const cache = new Map<string, { promise: Promise<ShowFeed | null>; ts: number }>()

// since: この日付(東京, YYYY-MM-DD)より前のエピソードを捨てる。
// 同じAnchor枠で旧番組が配信されていた場合の混入除去(例: BrandShiftは新シリーズ
// #001=2026-03-10以降のみ。それ以前は別番組がこの枠を使っていた)。
export function fetchShowFeed(feedUrl: string, since?: string): Promise<ShowFeed | null> {
  // 鍵は**feedUrlだけ**にする(2026-07-30 Error 1102の反省)。
  // 一度、鍵に30分の窓を混ぜた。すると全拠点のパース済みキャッシュが同時刻に
  // 一斉に無効化され、境界の最初のリクエストが830KBのXMLを5番組ぶん
  // 再パースして無料プランのCPU 10msを超え、1102が出た。
  // 相対TTL(書き込みから30分)なら期限は拠点ごとにばらけるので山が立たない。
  // 新しさは取得URL側の窓(revUrl)だけで担保する。
  const hit = cache.get(feedUrl)
  let promise: Promise<ShowFeed | null>
  if (hit && Date.now() - hit.ts < TTL_MS) {
    promise = hit.promise
  } else {
    promise = loadFeed(feedUrl)
    cache.set(feedUrl, { promise, ts: Date.now() })
  }
  if (!since) return promise
  return promise.then((feed) => applySince(feed, since))
}

// 軽量フィード(2026-07-21 CPU削減第2弾): description(容量の約9割)と
// searchTextを空にした版。波形キューは全ページ共通で3番組分を要求するため、
// ここが軽いとサイト全リクエストのJSON.parseコストが桁で下がる。
// 概要欄が要るのはPodcast棚の番組/エピソードページだけ(そこはフル版を使う)
export function fetchShowFeedLight(feedUrl: string, since?: string): Promise<ShowFeed | null> {
  // 鍵は feedUrl だけ(上と同じ理由。窓を混ぜると期限が同時刻に揃って山が立つ)
  const hit = lightCache.get(feedUrl)
  let promise: Promise<ShowFeed | null>
  if (hit && Date.now() - hit.ts < TTL_MS) {
    promise = hit.promise
  } else {
    promise = loadFeedLight(feedUrl)
    lightCache.set(feedUrl, { promise, ts: Date.now() })
  }
  if (!since) return promise
  return promise.then((feed) => applySince(feed, since))
}

const lightCache = new Map<string, { promise: Promise<ShowFeed | null>; ts: number }>()

function applySince(feed: ShowFeed | null, since: string): ShowFeed | null {
  if (!feed) return null
  const episodes = feed.episodes.filter((e) => e.date >= since)
  return { ...feed, episodes, latest: episodes[0]?.date ?? null }
}

async function loadFeedLight(feedUrl: string): Promise<ShowFeed | null> {
  const edge = edgeCache()
  const edgeKey = `${EDGE_KEY_PREFIX}light/${encodeURIComponent(feedUrl)}`
  if (edge) {
    try {
      const hit = await edge.match(edgeKey)
      if (hit) return (await hit.json()) as ShowFeed
    } catch {
      // エッジキャッシュ不調時は素通りしてフル経路へ
    }
  }
  // XMLから**直接軽量パース**する(2026-07-30)。以前はfetchShowFeed(フル)を
  // 呼んでから概要欄を捨てていたため、軽量版が欲しいだけのリクエスト
  // (Home・全ページ共通の波形キュー・sitemap・/podcast一覧)が、コールドな
  // 拠点では必ずフルパースの代金を払っていた。
  // 実測: Homeの5番組が全部コールドのとき 20.4ms → 10.7ms。
  // さらにエッジに置くJSONが10分の1(467KB→44KB)になるので、
  // 温まっているときのJSON.parseも1.07ms→0.1ms程度に落ちる=平常時が軽くなる。
  const light = await loadFeedXml(feedUrl, { light: true })
  if (!light) return null
  if (edge) {
    try {
      await edge.put(edgeKey, feedJsonResponse(light))
    } catch {
      // 書き込み失敗は無視
    }
  }
  return light
}

// Workersランタイムのエッジキャッシュ(Cache API)。Node dev/Vercelには無いため
// 実行時に存在確認して使う。合成URLをキーにパース済みJSONを置く。
// v1等のバージョンはEpisodeの形が変わったときに上げる(旧形の読み込み防止)
const EDGE_KEY_PREFIX = 'https://feed-cache.internal/v2/'

// 30分の「窓」の番号(2026-07-29の障害対応)。
//
// 症状: 7/29夜に配信された新エピソードが、翌朝までHomeとUpdatesに出てこなかった
// (番組ページはISRで自力更新されるため出ていた)。
//
// 原因: AnchorのRSSが cache-control: public, s-maxage=605299(約7日) を返している。
// s-maxageは共有キャッシュ向けの指示なので、Workersのfetchの手前にいる
// Cloudflareのキャッシュがこれに従い、**同じURLに対して最大7日ぶん古いXMLを
// 配り続けていた**(実測 age: 42034 = 11.7時間)。next.revalidateやTTLは
// こちらの都合であって、共有キャッシュの寿命を短くする力はない。
//
// 対策: **取得URLだけ**に30分ごとに変わるパラメータを付けて別物にする。
// 期限が切れて取り直すとき、今の窓のURLはどの層も古い実体を持っていないので
// 必ず新しく取れる。Anchorは未知のクエリを無視して同じ内容を返す(確認済み)。
//
// ※窓を**キャッシュの鍵**にも混ぜてはいけない(2026-07-30に一度やって1102を出した)。
//   鍵に混ぜると全拠点のパース済みキャッシュが同時刻に一斉に無効化され、
//   境界の最初のリクエストが830KBのXMLを5番組ぶん再パースしてCPU 10msを超える。
//   鍵は相対TTL(書き込みから30分)のまま=期限が拠点ごとにばらけて山が立たない。
//   その代わり反映は最悪60分になるが、落ちないことを優先する。
function feedWindow(): number {
  return Math.floor(Date.now() / TTL_MS)
}

function revUrl(feedUrl: string): string {
  return `${feedUrl}${feedUrl.includes('?') ? '&' : '?'}rev=${feedWindow()}`
}

type EdgeCache = {
  match(key: string): Promise<Response | undefined>
  put(key: string, res: Response): Promise<void>
}

function edgeCache(): EdgeCache | null {
  const c = (globalThis as { caches?: { default?: EdgeCache } }).caches
  return c?.default ?? null
}

// フィードを取ってパースする一段(2026-07-30に切り出し)。
// フル・軽量のどちらもここを通る=取得URLの窓(revUrl)の扱いが1箇所に集まる。
async function loadFeedXml(
  feedUrl: string,
  opts: { light?: boolean } = {}
): Promise<ShowFeed | null> {
  try {
    // Nextのデータキャッシュ(next.revalidate)は通さない(2026-08-13)。
    // 8/12 20:00配信の新エピソードが11時間後も/updatesに出ない障害の対応。
    // 配信直後の76分間(Anchor内側キャッシュが古い間)に取り込んだ古いXMLを、
    // OpenNext+改変Next16のデータキャッシュ(R2+拠点キャッシュ)が期限(1800s)を
    // 過ぎても返し続けた(他の層は全て30分以内に切れることをコードで確認済み
    // =消去法でこの層)。
    // オプション無しのfetchはこのNextでは「auto no cache」=データキャッシュに
    // 入らず、ルートの静的性にも影響しない(cache:'no-store'は不可: no-storeを
    // 1つでも含むルートは動的化する、とISRガイドに明記。/podcast配下のISRが
    // 毎リクエスト再生成に戻り1102が再来する)。
    // 取得頻度は自前の2層(インメモリ30分+拠点エッジJSON 30分)が今までどおり
    // 抑える。実際の反映はAnchor内側キャッシュの都合で配信後最大1〜2時間
    // (rev=の窓はAnchorの外側しか破れない。x-cache: MISS,HIT,HITで実測確認)
    const res = await fetch(revUrl(feedUrl))
    if (!res.ok) return null
    return parseFeed(await res.text(), opts)
  } catch {
    // フィード到達不可: null(表示側はその番組を出さない/エピソードなし扱い)
    return null
  }
}

// 無料プランのCPU制限(10ms/リクエスト)対策(2026-07-21 Error 1102調査):
// 1MB級XMLの正規表現パースをリクエスト経路から追い出し、パース済みJSONを
// エッジ拠点毎に30分キャッシュする。コールドなisolateはJSON.parseだけで済む
// (実測: 成功リクエストのCPU中央値13.7ms・P99 505msの主因がこのパースだった)
async function loadFeed(feedUrl: string): Promise<ShowFeed | null> {
  const edge = edgeCache()
  // 鍵に窓は混ぜない(2026-07-30)。混ぜると全拠点の期限が同時刻に揃い、
  // 境界で一斉に再パースが走って1102が出た。相対TTLで期限をばらけさせる
  const edgeKey = `${EDGE_KEY_PREFIX}${encodeURIComponent(feedUrl)}`
  if (edge) {
    try {
      const hit = await edge.match(edgeKey)
      if (hit) return (await hit.json()) as ShowFeed
    } catch {
      // エッジキャッシュ不調時は素通りして通常経路へ
    }
  }

  const feed = await loadFeedXml(feedUrl)

  if (feed && edge) {
    try {
      await edge.put(edgeKey, feedJsonResponse(feed))
    } catch {
      // 書き込み失敗は無視(次のリクエストが再パースするだけ)
    }
  }
  return feed
}

function feedJsonResponse(feed: ShowFeed): Response {
  return new Response(JSON.stringify(feed), {
    headers: {
      'content-type': 'application/json',
      'cache-control': `max-age=${TTL_MS / 1000}`,
    },
  })
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

// Homeのカバー+最新日付用の薄いラッパー(概要欄不要なので軽量版を使う)
export async function channelInfo(
  feedUrl: string,
  since?: string
): Promise<{ image: string | null; latest: string | null }> {
  const feed = await fetchShowFeedLight(feedUrl, since)
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

// light=true: 概要欄(容量の約9割)に一切触れない。抽出もせず検索テキストも作らない。
// 2026-07-30の実測(手元, 9回平均): ON-AIRDOのフィード924KB・85話で
//   full 6.6ms → light 3.0ms、JSON化後 467KB → 44KB。
// 無料プランのCPUは10ms/リクエストなので、この差が1102の余裕を決める。
// (正規表現を事前生成に変える案も測ったが誤差内だったので入れていない)
function parseFeed(xml: string, { light = false }: { light?: boolean } = {}): ShowFeed {
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
    const description = light ? '' : (tagText(item, 'description') ?? '')
    episodes.push({
      id,
      title: decodeEntities(title),
      date,
      description,
      // 検索用(EpisodeIndex)。表示毎に全話へ回すと重いのでここで1回だけ。
      // 軽量版は概要欄を持たないので検索テキストも作らない(使う側=波形キュー・
      // sitemap・カバーは概要欄を見ない)
      searchText: light ? '' : htmlToPlainText(description).slice(0, 600),
      image: httpsUrl(item.match(/<itunes:image[^>]*\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? null),
      link,
      audioUrl: httpsUrl(item.match(/<enclosure[^>]*\burl\s*=\s*["']([^"']+)["']/i)?.[1] ?? null),
      duration: tagText(item, 'itunes:duration'),
    })
  }

  return {
    title: decodeEntities(tagText(head, 'title') ?? ''),
    description: light ? '' : decodeEntities(tagText(head, 'description') ?? ''),
    image,
    latest: episodes[0]?.date ?? null,
    episodes,
  }
}
