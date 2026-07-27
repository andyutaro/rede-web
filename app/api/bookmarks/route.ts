import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createService } from '@/lib/supabase/service'
import { scanBookmarks, fetchTitles } from '@/lib/studio/bookmarks'

// ブックマーク室のAPI(2026-07-27)。認証済みセッションのみ。
// 書き込みはservice role(bookmarksに認証者の書き込みポリシーは作らない)。
// - scan: 本文を再走査して同期し、続けてタイトルを1バッチ取得
// - fetch: タイトル未取得分をもう1バッチ取得(取り残しの追い込み用)
// - refetch: 1件だけfetched_atを消して取得し直す(失敗リンクの再挑戦)
// - hide: 一覧から外す/戻す(本文は触らない)
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { action?: string; url?: string; hidden?: boolean }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const service = createService()
  try {
    if (body.action === 'scan') {
      const scan = await scanBookmarks(service)
      const titles = await fetchTitles(service, 12)
      return NextResponse.json({ ...scan, ...titles })
    }
    if (body.action === 'fetch') {
      const titles = await fetchTitles(service, 12)
      return NextResponse.json(titles)
    }
    if (body.action === 'refetch' && body.url) {
      await service.from('bookmarks').update({ fetched_at: null }).eq('url', body.url)
      const titles = await fetchTitles(service, 1)
      return NextResponse.json(titles)
    }
    if (body.action === 'hide' && body.url && typeof body.hidden === 'boolean') {
      const { error } = await service
        .from('bookmarks')
        .update({ hidden: body.hidden })
        .eq('url', body.url)
      if (error) throw new Error(error.message)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed' },
      { status: 500 }
    )
  }
}
