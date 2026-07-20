import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
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

  let body: {
    showSlug?: string
    episodeId?: string
    tags?: string[]
    action?: string
    items?: { showSlug?: string; episodeId?: string }[]
  }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  // Inboxのゴミ箱: hidden=true/falseの一括切替(エピソード本体はRSSが真実で
  // 消せないため、「ゴミ箱」=Inboxから見えなくするフラグ)
  if (body.action === 'hide' || body.action === 'unhide') {
    const items = body.items
    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 100 ||
      items.some(
        (i) => !i.showSlug || !SHOWS.some((s) => s.slug === i.showSlug) || !i.episodeId
      )
    ) {
      return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
    }
    const hidden = body.action === 'hide'
    const now = new Date().toISOString()
    // upsert: 既存行はhiddenだけ更新(tagsは保持)、未タグの行は新規作成される
    const { error } = await supabase.from('episode_tags').upsert(
      items.map((i) => ({
        show_slug: i.showSlug!,
        episode_id: i.episodeId!,
        hidden,
        updated_at: now,
      }))
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, count: items.length })
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

  // タグを空にしたら行ごと消す(未タグ状態に戻る)。
  // ただしhidden(ゴミ箱)の行はフラグを失わないよう消さずにタグだけ空にする
  if (clean.length === 0) {
    const { error } = await supabase
      .from('episode_tags')
      .delete()
      .eq('show_slug', showSlug)
      .eq('episode_id', episodeId)
      .eq('hidden', false)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    await supabase
      .from('episode_tags')
      .update({ tags: [], updated_at: new Date().toISOString() })
      .eq('show_slug', showSlug)
      .eq('episode_id', episodeId)
    revalidatePath(`/podcast/${showSlug}`) // 入門3選の即時反映(ISRを待たない)
    return NextResponse.json({ ok: true, tags: [] })
  }

  const { error } = await supabase.from('episode_tags').upsert({
    show_slug: showSlug,
    episode_id: episodeId,
    tags: clean,
    updated_at: new Date().toISOString(),
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath(`/podcast/${showSlug}`) // 入門3選の即時反映(ISRを待たない)
  return NextResponse.json({ ok: true, tags: clean })
}
