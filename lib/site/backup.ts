import { createClient } from '@supabase/supabase-js'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { SHOWS } from './shows'

// 書いたものの控え(2026-07-23)。
// このサイトで失ったら戻らないのは、コードでも音源でもなく Andy が書いたもの
// (scribeの日誌・記事・本文の写真)。それらはSupabaseの中にしか存在せず、
// 無料プランには時点復旧が無い=誤って消したら終わりだった。
// 毎晩のcron(scribe確定)のついでにR2へ写す。
//
// 方針:
// - 文章は毎回JSONで丸ごと(全部でも数百KB。世代を残せるので事故から巻き戻せる)
// - 写真は「まだ写していないものだけ」= 差分。同じ画像を毎晩コピーしない
//   (無料枠の操作回数を無駄に使わないため。R2側で消えない限り一度で済む)
// - 失敗しても確定処理を巻き添えにしない(呼び出し側でcatchする)

// R2の型は@cloudflare/workers-typesを入れないと来ないが、使う形だけ書く
type R2Store = {
  list(options?: { prefix?: string; cursor?: string }): Promise<{
    objects: { key: string }[]
    truncated: boolean
    cursor?: string
  }>
  put(
    key: string,
    value: string | ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>
  get(key: string): Promise<{
    arrayBuffer(): Promise<ArrayBuffer>
    httpMetadata?: { contentType?: string }
  } | null>
}
// 一晩に写す写真の上限。初回は溜まっている分を数晩かけて片付ける
// (1リクエストのCPU/時間制限に収めるため)
// Workersの1起動あたりサブリクエスト上限(50)を、同じcron内の他の処理と分け合う。
// 写真1枚につきR2からの取得+R2への書き込みで2回使うので、控えめに置く。
// 溜まっている分は数晩かけて片付く(2晩目以降は差分なのでほぼ0枚)。
//
// 12→6へ(2026-08-29)。この数字は「控え+掃除+ブックマーク」の3工程で
// 分け合う前提で決まっていたが、同じ日に**掃除のR2一覧/削除**と
// **再生キューの作り置き**が加わって5工程になった。ログに
// `Too many subrequests by single Worker invocation` が実際に出ている以上、
// 一番数を使うここを削って余裕を作る。
// **上限に当たっても壊れはしないが、止まる場所によっては控えが数日進まないまま
// 気づかない**――それが一番まずい失敗の仕方なので、枚数で予防する。
const MAX_PHOTOS_PER_RUN = 6

type BackupResult = {
  text?: string
  photos?: { copied: number; skipped: number; remaining: number }
  feeds?: { saved: number; same: number; failed: number }
  error?: string
}

function service() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function backupToR2(): Promise<BackupResult> {
  // async: true でないとルートハンドラでは文脈が取れず例外になる
  // (同期版はグローバルに文脈が載っている前提。2026-07-23に踏んだ)
  const { env } = await getCloudflareContext({ async: true })
  const e = env as unknown as { BACKUP_BUCKET?: R2Store; MEDIA_BUCKET?: R2Store }
  const bucket = e.BACKUP_BUCKET
  if (!bucket) return { error: 'BACKUP_BUCKET未設定' }
  // メディアの原本はR2へ移った(2026-08-29)。控えの取り出し元もそちらへ切り替える。
  // **切り替え前は、新しくアップした分がSupabaseに現れないので控えが取られていなかった**
  // (実測: 移行当日にアップした2枚がrede-web-backupに存在しなかった)
  const mediaBucket = e.MEDIA_BUCKET
  if (!mediaBucket) return { error: 'MEDIA_BUCKET未設定' }

  const supabase = service()
  const result: BackupResult = {}

  // ---- 1. 文章(scribe・記事・タグ・受信箱) ----
  // 日付つきで置く=世代が残る。誤削除の翌日でも前日の控えから戻せる
  try {
    const [days, articles, tags, contacts] = await Promise.all([
      supabase.from('scribe_days').select('*'),
      supabase.from('articles').select('*'),
      supabase.from('episode_tags').select('*'),
      supabase.from('contact_messages').select('*'),
    ])
    const stamp = new Date().toISOString().slice(0, 10)
    const payload = JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        scribe_days: days.data ?? [],
        articles: articles.data ?? [],
        episode_tags: tags.data ?? [],
        contact_messages: contacts.data ?? [],
      },
      null,
      1
    )
    await bucket.put(`text/${stamp}.json`, payload, {
      httpMetadata: { contentType: 'application/json' },
    })
    // 最新版は固定の名前でも置く(戻すときに日付を探さなくて済む)
    await bucket.put('text/latest.json', payload, {
      httpMetadata: { contentType: 'application/json' },
    })
    result.text = `${(days.data ?? []).length}日 / ${(articles.data ?? []).length}件`
  } catch (e) {
    result.error = '文章: ' + (e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  }

  // ---- 2. 写真(差分) ----
  try {
    result.photos = await copyPhotos(bucket, mediaBucket, MAX_PHOTOS_PER_RUN)
  } catch (e) {
    result.error = (result.error ? result.error + ' / ' : '') +
      '写真: ' + (e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  }

  // ---- 3. 番組フィード(生のXML、変わった時だけ) ----
  try {
    result.feeds = await copyFeeds(bucket)
  } catch (e) {
    result.error = (result.error ? result.error + ' / ' : '') +
      'フィード: ' + (e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  }

  return result
}

// 番組フィードの控え(2026-09-26)。
//
// **なぜ。** 5番組のフィード、約330回ぶんの題・日付・概要・アート・音源URLは、
// 全部Anchor(Spotify)側にしか無い。サイトが持っているのは夜の作り置き
// (番組あたり24回)とタグだけで、**カタログの本体はどこにも控えが無かった**。
// カバーURLのローテーションで403を踏んだ実績があり、フィードが止まるか形が
// 変われば番組棚・索引・GUEST群・sitemapが同時に痩せる。生のXMLを持っておけば、
// 少なくとも「何をいつ出したか」は自分の手元に残る。
//
// 方針:
// - **gzipして置く。** 5番組で生1.5〜1.8MB級・合計5.8MBだが、gzipなら合計437KB
//   (RSSは同じタグの繰り返しなので13倍前後で縮む)。毎晩でも枠を圧迫しない
// - **中身が変わった夜だけ世代を足す。** 判定はXMLのSHA-256で、前回値は
//   feeds/index.json に1つだけ置く(番組ごとにheadを打たない=サブリクエスト節約)。
//   新しい回が出た夜だけ増えるので、実質は番組あたり月4〜5世代
// - **取得に失敗した応答で上書きしない。** 短すぎる/<item>が無い応答は捨てる
//   (空の控えで正しい控えを潰すのが、この手の仕組みの一番まずい壊れ方)
// - 戻すときは gunzip すれば普通のRSSなので、そのまま parseFeed に通せる
type FeedIndex = Record<string, { hash: string; date: string }>

async function gzipBytes(text: string): Promise<ArrayBuffer> {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))
  return await new Response(stream).arrayBuffer()
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function copyFeeds(bucket: R2Store): Promise<{ saved: number; same: number; failed: number }> {
  const stamp = new Date().toISOString().slice(0, 10)
  const indexKey = 'feeds/index.json'
  let index: FeedIndex = {}
  try {
    const current = await bucket.get(indexKey)
    if (current) index = JSON.parse(new TextDecoder().decode(await current.arrayBuffer())) as FeedIndex
  } catch {
    index = {} // 読めなければ全部を新規として置き直す(控えが増えるだけで害は無い)
  }

  let saved = 0
  let same = 0
  let failed = 0
  for (const show of SHOWS) {
    if (!show.feed) continue // 未配信の番組(フィードURL待ち)
    try {
      const res = await fetch(show.feed)
      if (!res.ok) {
        failed++
        continue
      }
      const xml = await res.text()
      // 取得できた"ように見えて中身が無い"応答で、正しい控えを潰さない
      if (xml.length < 1000 || !xml.includes('<item')) {
        failed++
        continue
      }
      const hash = await sha256Hex(xml)
      if (index[show.slug]?.hash === hash) {
        same++
        continue
      }
      const gz = await gzipBytes(xml)
      const meta = { httpMetadata: { contentType: 'application/gzip' } }
      await bucket.put(`feeds/${show.slug}/${stamp}.xml.gz`, gz, meta)
      // 最新版は固定の名前でも置く(戻すときに日付を探さなくて済む。文章の控えと同じ作法)
      await bucket.put(`feeds/${show.slug}/latest.xml.gz`, gz, meta)
      index[show.slug] = { hash, date: stamp }
      saved++
    } catch {
      failed++
    }
  }
  await bucket.put(indexKey, JSON.stringify(index, null, 1), {
    httpMetadata: { contentType: 'application/json' },
  })
  return { saved, same, failed }
}

// 写真の控え(差分)。夜のcronと、控え専用のcron(backupPhotos)が共有する
async function copyPhotos(
  bucket: R2Store,
  mediaBucket: R2Store,
  max: number
): Promise<{ copied: number; skipped: number; remaining: number }> {
  const paths = await listAllMedia(mediaBucket)
  // 既にある控えは1回の一覧で把握する(1枚ずつheadすると枚数分の
  // サブリクエストを使い切ってしまう。2026-07-23に上限へ当たった)
  const already = await listBackedUp(bucket)
  let copied = 0
  let skipped = 0
  let remaining = 0
  for (const path of paths) {
    const key = `media/${path}`
    if (already.has(key)) {
      skipped++
      continue
    }
    if (copied >= max) {
      remaining++
      continue
    }
    const obj = await mediaBucket.get(path)
    if (!obj) continue
    await bucket.put(key, await obj.arrayBuffer(), {
      httpMetadata: { contentType: obj.httpMetadata?.contentType || 'application/octet-stream' },
    })
    copied++
  }
  return { copied, skipped, remaining }
}

// 控え専用のcron(2026-09-14)が1回に写す枚数。
// 夜のcronは確定・掃除・再生キュー・ブックマークと上限(1起動あたりサブリクエスト50本)を
// 分け合うので6枚が限界だった(12枚で上限に当たった記録がある)。写真をまとめて上げると
// 控えが何週間も追いつかない(2026-09-14に未処理145枚)。
// 控えだけを担当する起動なら上限をまるごと使える。1枚=取得+書き込みの2本なので
// 20枚=40本、一覧の分を残して余裕を持たせる
export const MAX_PHOTOS_DEDICATED_RUN = 20

export async function backupPhotos(): Promise<{
  photos?: { copied: number; skipped: number; remaining: number }
  error?: string
}> {
  const { env } = await getCloudflareContext({ async: true })
  const e = env as unknown as { BACKUP_BUCKET?: R2Store; MEDIA_BUCKET?: R2Store }
  if (!e.BACKUP_BUCKET) return { error: 'BACKUP_BUCKET未設定' }
  if (!e.MEDIA_BUCKET) return { error: 'MEDIA_BUCKET未設定' }
  try {
    return { photos: await copyPhotos(e.BACKUP_BUCKET, e.MEDIA_BUCKET, MAX_PHOTOS_DEDICATED_RUN) }
  } catch (err) {
    return { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) }
  }
}

// 控え済みの写真のキーを一度に把握する(R2の一覧はサブリクエストを消費しない)
async function listBackedUp(bucket: R2Store): Promise<Set<string>> {
  const keys = new Set<string>()
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix: 'media/', cursor })
    for (const o of page.objects) keys.add(o.key)
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return keys
}

// バケット直下+日付フォルダ配下の全ファイルを列挙する
// (cleanupOrphanMedia と同じ構造。あちらは消す側、こちらは残す側)
// メディアの一覧(R2)。R2は階層を持たないので日付フォルダを辿る必要がない=
// Supabase Storageを列挙していた頃より呼び出しも少なくて済む。
//
// **新しい順に返す(2026-08-29)。** R2の一覧はキー順=「YYYY-MM-DD/uuid」の古い順で
// 返るので、そのまま使うと**いちばん新しい=いちばん失いたくないものが最後に回る**。
// 実際、移行直後は残り45件を一晩6枚ずつで、当日アップした写真は8晩後だった。
// 控えの目的からすると順番が逆なので、ここで反転させる。
async function listAllMedia(media: R2Store): Promise<string[]> {
  const out: string[] = []
  let cursor: string | undefined
  do {
    const r = await media.list({ cursor })
    for (const o of r.objects) out.push(o.key)
    cursor = r.truncated ? r.cursor : undefined
  } while (cursor)
  return out.reverse()
}
