import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { buildHeroPool } from '@/lib/site/heroQueue'
import { mediaPathOf } from '@/lib/site/media'
import { createClient } from '@supabase/supabase-js'
import { backupToR2 } from '@/lib/site/backup'
import { scanBookmarks, fetchTitles } from '@/lib/studio/bookmarks'

// 毎日0:01 JST(15:01 UTC)にVercel Cronから呼ばれ、「いま終わった日」の
// scribe_daysにfinalized_atを立てる(仕様: アーカイブは毎日0:01に確定)。
//
// - 認証: Vercelが自動で付けるAuthorization: Bearer <CRON_SECRET>を検証
// - 冪等: すでにfinalized_atが立っている行は触らない(タブの日付跨ぎ検知による
//   既存の確定処理と二重発火しない)
// - Hobbyプランのcronは実行時刻が最大1時間程度ずれることがあるため、
//   「実行時点のJST日付の前日」を対象にする(ずれても対象日は変わらない)
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // JSTの「昨日」= いま0:01過ぎに終わったばかりの日
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  nowJst.setUTCDate(nowJst.getUTCDate() - 1)
  const target = nowJst.toISOString().slice(0, 10)

  // cronはユーザーセッションを持たないため、ここだけservice roleで書く
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('scribe_days')
    .update({ finalized_at: new Date().toISOString() })
    .eq('date', target)
    .is('finalized_at', null)
    .select('date')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 書いたものの控えをR2へ(2026-07-23)。掃除より先に走らせる=消える前の姿を残す。
  // 失敗しても確定処理を巻き添えにしない
  let backup: Awaited<ReturnType<typeof backupToR2>>
  try {
    backup = await backupToR2()
  } catch (e) {
    backup = { error: e instanceof Error ? e.message : 'backup failed' }
  }

  // 確定に続けて未参照メディアの掃除。掃除の失敗で確定を巻き添えにしない
  let cleanup: Awaited<ReturnType<typeof cleanupOrphanMedia>>
  try {
    cleanup = await cleanupOrphanMedia()
  } catch (e) {
    cleanup = { deleted: 0, error: e instanceof Error ? e.message : 'cleanup failed' }
  }

  // PODCASTピルの連続再生キューを作り置く(2026-08-29)。全ページ共通のレイアウトが
  // 毎回RSSを取っていた頃、冷えた拠点でCPU上限を超えて作り直しが失敗し続けていた
  // (7日で8,190件)。ここで1日1回だけ作れば、読む側は87KB/0.19msで済む。
  // **一番最後に置く**: 失敗しても確定・控え・掃除を巻き添えにせず、
  // かつサブリクエストを先に使い切っても読む側には従来のRSS経路の保険がある
  let heroQueue: Awaited<ReturnType<typeof buildHeroPool>>
  try {
    heroQueue = await buildHeroPool()
  } catch (e) {
    heroQueue = { count: 0, error: e instanceof Error ? e.message : 'heroQueue failed' }
  }

  // ブックマークの夜間同期(2026-07-27): 本文のリンクを索引へ、タイトルは
  // 少量ずつ取得(サブリクエスト上限を食い潰さないよう8件)。失敗しても他を巻き添えにしない
  let bookmarks: unknown
  try {
    const scan = await scanBookmarks(supabase)
    const titles = await fetchTitles(supabase, 8)
    bookmarks = { ...scan, ...titles }
  } catch (e) {
    bookmarks = { error: e instanceof Error ? e.message : 'bookmarks failed' }
  }

  const result = {
    ok: true,
    target,
    finalized: (data ?? []).length > 0, // false = 行がない(その日書かなかった) or 確定済み
    backup,
    cleanup,
    heroQueue,
    bookmarks,
  }
  // **必ず記録に残す(2026-08-29)。** 戻り値はHTTPの応答として返るだけで、
  // 自動実行では誰も読まない=控えが毎晩失敗していても気づけない。
  // 実際、この行を足すまで結果を見るには手でcronを叩くしかなかった。
  // ここに出しておけばObservabilityに残り、日次点検からも読める
  console.log('[cron] ' + JSON.stringify(result))
  return NextResponse.json(result)
}

// ---- 未参照メディアの掃除(2026-07-10) ----
// 本文から削除された画像等がscribe-mediaバケットに残り続けると、
// サムネイル充当プールとHomeのランダム写真の母集団を汚染する。
// どのscribe/articleの本文にも現れず、手動サムネイルでもないファイルを消す。
// 直近24時間内に作られたファイルは対象外(アップロード直後〜保存前の競合の保険)。
// 掃除の対象はR2(2026-08-29)。メディアの原本がここへ移ったので、Supabaseを
// 見ていた頃のままだと**新しく上げた分の孤児が永久に溜まる**(掃除が実質止まる)。
// Supabase側の439MBは移行前の原本として凍結し、もう消さない
// =R2に何かあったときの戻り先として残す
type R2Clean = {
  list(options?: { cursor?: string }): Promise<{
    objects: { key: string; uploaded?: string | Date }[]
    truncated: boolean
    cursor?: string
  }>
  delete(keys: string[]): Promise<unknown>
}

async function cleanupOrphanMedia() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const [daysRes, artsRes, privRes] = await Promise.all([
    supabase.from('scribe_days').select('date, html, thumbnail_url, thumbnail_source'),
    supabase.from('articles').select('id, html, thumbnail_url, thumbnail_source'),
    // privateのメモも参照元に数える(2026-08-29)。この掃除は2026-07-10のもので、
    // 2026-08-16に増えたprivateを知らないまま動いていた。いまは中に画像が
    // 一枚も無いので実害は出ていないが、貼った翌日に消える穴が空いていた
    supabase.from('desk_private_notes').select('id, html'),
  ])
  if (daysRes.error || artsRes.error) {
    // 参照元が読めない状態で消すのは危険なので何もしない
    return { deleted: 0, error: daysRes.error?.message ?? artsRes.error?.message }
  }
  if (privRes.error) {
    // privateが読めないときも消さない(参照元を1つ欠いたまま判定しない)
    return { deleted: 0, error: privRes.error.message }
  }
  const rows = [...(daysRes.data ?? []), ...(artsRes.data ?? [])]
  const htmlAll = [...rows, ...(privRes.data ?? [])]
    .map((r) => (r.html as string) ?? '')
    .join('\n')
  // 突き合わせは**パス**で行う(2026-08-29)。メディアの配信元をR2へ移したので
  // 本文中のURLは media.andyutaro.com/<path> になった。完全URLで見ていた頃の
  // ままだと、移行直後に参照中のファイルが全て孤児=削除対象になる。
  // パス(YYYY-MM-DD/uuid.ext)は新旧のURLで同一なので、これなら両方に効く
  const manualThumbPaths = new Set(
    rows
      .filter((r) => r.thumbnail_source === 'manual' && r.thumbnail_url)
      .map((r) => mediaPathOf(r.thumbnail_url as string))
      .filter((p): p is string => !!p)
  )

  // R2の全ファイルを列挙(階層が無いので日付フォルダを辿る必要がない)
  const { env } = await getCloudflareContext({ async: true })
  const media = (env as unknown as { MEDIA_BUCKET?: R2Clean }).MEDIA_BUCKET
  if (!media) return { deleted: 0, error: 'MEDIA_BUCKET未設定' }
  const files: { path: string; createdAt: string | null }[] = []
  let cursor: string | undefined
  do {
    const r = await media.list({ cursor })
    for (const o of r.objects) {
      files.push({ path: o.key, createdAt: o.uploaded ? new Date(o.uploaded).toISOString() : null })
    }
    cursor = r.truncated ? r.cursor : undefined
  } while (cursor)

  const dayMs = 24 * 60 * 60 * 1000
  const orphanPaths: string[] = []
  const orphanPathSet = new Set<string>()
  for (const f of files) {
    if (f.createdAt && Date.now() - new Date(f.createdAt).getTime() < dayMs) continue
    // パスにはuuidが入るので、本文に偶然含まれることはない
    if (htmlAll.includes(f.path) || manualThumbPaths.has(f.path)) continue
    orphanPaths.push(f.path)
    orphanPathSet.add(f.path)
  }

  // R2のdeleteは一度に大量指定しない(100件ずつ)
  for (let i = 0; i < orphanPaths.length; i += 100) {
    try {
      await media.delete(orphanPaths.slice(i, i + 100))
    } catch (e) {
      return { deleted: i, error: e instanceof Error ? e.message : String(e) }
    }
  }

  // 消したファイルを充当サムネイルとして焼き込んでいた行はリセット(次の表示で再充当される)
  for (const r of daysRes.data ?? []) {
    if (r.thumbnail_url && orphanPathSet.has(mediaPathOf(r.thumbnail_url as string) ?? '')) {
      await supabase
        .from('scribe_days')
        .update({ thumbnail_url: null, thumbnail_source: null })
        .eq('date', r.date)
    }
  }
  for (const r of artsRes.data ?? []) {
    if (r.thumbnail_url && orphanPathSet.has(mediaPathOf(r.thumbnail_url as string) ?? '')) {
      await supabase
        .from('articles')
        .update({ thumbnail_url: null, thumbnail_source: null })
        .eq('id', r.id)
    }
  }

  return { deleted: orphanPaths.length }
}
