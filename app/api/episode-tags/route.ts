import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { SHOWS } from '@/lib/site/shows'

// エピソードへの手動タグ付け(Podcast Inbox)。エピソード本体はRSSが真実なので
// 保存するのはタグだけ。書き込みはセッションクライアント+RLS authenticated。
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { showSlug?: string; episodeId?: string; tags?: string[] }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { showSlug, episodeId, tags } = body
  if (
    !showSlug ||
    !SHOWS.some((s) => s.slug === showSlug) ||
    !episodeId ||
    !Array.isArray(tags) ||
    tags.some((t) => typeof t !== 'string')
  ) {
    return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
  }

  const clean = tags.map((t) => t.trim()).filter(Boolean)

  // タグを空にしたら行ごと消す(未タグ状態に戻る)
  if (clean.length === 0) {
    const { error } = await supabase
      .from('episode_tags')
      .delete()
      .eq('show_slug', showSlug)
      .eq('episode_id', episodeId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, tags: [] })
  }

  const { error } = await supabase.from('episode_tags').upsert({
    show_slug: showSlug,
    episode_id: episodeId,
    tags: clean,
    updated_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, tags: clean })
}
