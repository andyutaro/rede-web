import { createClient } from '@supabase/supabase-js'
import { getCloudflareContext } from '@opennextjs/cloudflare'

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

// R2の型は@cloudflare/workers-typesを入れないと来ないが、使うのはこの3つだけなので
// 依存を増やさず必要な形だけ書く(head/put/get)
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
}

const BUCKET = 'scribe-media'
// 一晩に写す写真の上限。初回は溜まっている分を数晩かけて片付ける
// (1リクエストのCPU/時間制限に収めるため)
// Workersの1起動あたりサブリクエスト上限(50)を、同じcron内の掃除処理と分け合う。
// 写真1枚につきSupabaseからの取得+R2への書き込みで2回使うので、控えめに置く。
// 溜まっている分は数晩かけて片付く(2晩目以降は差分なのでほぼ0枚)
const MAX_PHOTOS_PER_RUN = 12

type BackupResult = {
  text?: string
  photos?: { copied: number; skipped: number; remaining: number }
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
  const bucket = (env as unknown as { BACKUP_BUCKET?: R2Store }).BACKUP_BUCKET
  if (!bucket) return { error: 'BACKUP_BUCKET未設定' }

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
    const paths = await listAllMedia(supabase)
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
      if (copied >= MAX_PHOTOS_PER_RUN) {
        remaining++
        continue
      }
      const { data } = await supabase.storage.from(BUCKET).download(path)
      if (!data) continue
      await bucket.put(key, await data.arrayBuffer(), {
        httpMetadata: { contentType: data.type || 'application/octet-stream' },
      })
      copied++
    }
    result.photos = { copied, skipped, remaining }
  } catch (e) {
    result.error = (result.error ? result.error + ' / ' : '') +
      '写真: ' + (e instanceof Error ? `${e.name}: ${e.message}` : String(e))
  }

  return result
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
async function listAllMedia(supabase: ReturnType<typeof service>): Promise<string[]> {
  const out: string[] = []
  const { data: entries } = await supabase.storage.from(BUCKET).list('', { limit: 1000 })
  if (!entries) return out
  const folders: string[] = []
  for (const e of entries) {
    if (e.id !== null) out.push(e.name)
    else folders.push(e.name)
  }
  const lists = await Promise.all(
    folders.map((f) => supabase.storage.from(BUCKET).list(f, { limit: 1000 }))
  )
  lists.forEach((r, i) => {
    for (const f of r.data ?? []) if (f.id !== null) out.push(`${folders[i]}/${f.name}`)
  })
  return out
}
