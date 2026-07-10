import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

  // 確定に続けて未参照メディアの掃除。掃除の失敗で確定を巻き添えにしない
  let cleanup: Awaited<ReturnType<typeof cleanupOrphanMedia>>
  try {
    cleanup = await cleanupOrphanMedia()
  } catch (e) {
    cleanup = { deleted: 0, error: e instanceof Error ? e.message : 'cleanup failed' }
  }

  return NextResponse.json({
    ok: true,
    target,
    finalized: (data ?? []).length > 0, // false = 行がない(その日書かなかった) or 確定済み
    cleanup,
  })
}

// ---- 未参照メディアの掃除(2026-07-10) ----
// 本文から削除された画像等がscribe-mediaバケットに残り続けると、
// サムネイル充当プールとHomeのランダム写真の母集団を汚染する。
// どのscribe/articleの本文にも現れず、手動サムネイルでもないファイルを消す。
// 直近24時間内に作られたファイルは対象外(アップロード直後〜保存前の競合の保険)。
const BUCKET = 'scribe-media'

async function cleanupOrphanMedia() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const [daysRes, artsRes] = await Promise.all([
    supabase.from('scribe_days').select('date, html, thumbnail_url, thumbnail_source'),
    supabase.from('articles').select('id, html, thumbnail_url, thumbnail_source'),
  ])
  if (daysRes.error || artsRes.error) {
    // 参照元が読めない状態で消すのは危険なので何もしない
    return { deleted: 0, error: daysRes.error?.message ?? artsRes.error?.message }
  }
  const rows = [...(daysRes.data ?? []), ...(artsRes.data ?? [])]
  const htmlAll = rows.map((r) => (r.html as string) ?? '').join('\n')
  const manualThumbs = new Set(
    rows.filter((r) => r.thumbnail_source === 'manual' && r.thumbnail_url).map((r) => r.thumbnail_url as string)
  )

  // バケット全ファイル(ルート直下+日付フォルダ)を列挙
  const { data: entries, error: listErr } = await supabase.storage.from(BUCKET).list('', { limit: 1000 })
  if (listErr || !entries) return { deleted: 0, error: listErr?.message }
  const files: { path: string; createdAt: string | null }[] = []
  for (const e of entries) {
    if (e.id !== null) files.push({ path: e.name, createdAt: e.created_at ?? null })
  }
  const folders = entries.filter((e) => e.id === null)
  const folderLists = await Promise.all(
    folders.map((f) => supabase.storage.from(BUCKET).list(f.name, { limit: 1000 }))
  )
  folderLists.forEach((r, i) => {
    for (const f of r.data ?? []) {
      files.push({ path: `${folders[i].name}/${f.name}`, createdAt: f.created_at ?? null })
    }
  })

  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`
  const dayMs = 24 * 60 * 60 * 1000
  const orphanPaths: string[] = []
  const orphanUrls = new Set<string>()
  for (const f of files) {
    if (f.createdAt && Date.now() - new Date(f.createdAt).getTime() < dayMs) continue
    const url = base + f.path
    if (htmlAll.includes(url) || manualThumbs.has(url)) continue
    orphanPaths.push(f.path)
    orphanUrls.add(url)
  }

  // Storage APIのremoveは一度に大量指定しない(100件ずつ)
  for (let i = 0; i < orphanPaths.length; i += 100) {
    const { error: rmErr } = await supabase.storage.from(BUCKET).remove(orphanPaths.slice(i, i + 100))
    if (rmErr) return { deleted: i, error: rmErr.message }
  }

  // 消したファイルを充当サムネイルとして焼き込んでいた行はリセット(次の表示で再充当される)
  for (const r of daysRes.data ?? []) {
    if (r.thumbnail_url && orphanUrls.has(r.thumbnail_url as string)) {
      await supabase
        .from('scribe_days')
        .update({ thumbnail_url: null, thumbnail_source: null })
        .eq('date', r.date)
    }
  }
  for (const r of artsRes.data ?? []) {
    if (r.thumbnail_url && orphanUrls.has(r.thumbnail_url as string)) {
      await supabase
        .from('articles')
        .update({ thumbnail_url: null, thumbnail_source: null })
        .eq('id', r.id)
    }
  }

  return { deleted: orphanPaths.length }
}
