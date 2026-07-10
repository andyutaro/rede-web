import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// タグ管理(studioのTAGS室): リネーム・統合・削除。
// タグの実体はarticles.tags[]とepisode_tags.tags[]に散らばっているため、
// 該当行を横断で書き換える。to=既存タグならリネーム=統合(重複は排除)、
// to=nullで全行から削除。
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { from?: string; to?: string | null }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const from = (body.from ?? '').trim()
  const to = body.to === null ? null : (body.to ?? '').trim()
  if (!from || (to !== null && (!to || to.length > 40))) {
    return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
  }

  const retag = (tags: string[]) => {
    const next = tags.filter((t) => t !== from)
    if (to && !next.includes(to)) next.push(to)
    return next
  }

  const now = new Date().toISOString()
  let touched = 0

  // articles(削除済み含む: ゴミ箱から復元してもタグ体系が壊れないように)
  const { data: arts, error: artErr } = await supabase
    .from('articles')
    .select('id, tags')
    .contains('tags', [from])
  if (artErr) return NextResponse.json({ error: artErr.message }, { status: 500 })
  for (const a of arts ?? []) {
    const { error } = await supabase
      .from('articles')
      .update({ tags: retag((a.tags as string[]) ?? []), updated_at: now })
      .eq('id', a.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    touched++
  }

  // episode_tags
  const { data: eps, error: epErr } = await supabase
    .from('episode_tags')
    .select('show_slug, episode_id, tags')
    .contains('tags', [from])
  if (epErr) return NextResponse.json({ error: epErr.message }, { status: 500 })
  for (const e of eps ?? []) {
    const { error } = await supabase
      .from('episode_tags')
      .update({ tags: retag((e.tags as string[]) ?? []), updated_at: now })
      .eq('show_slug', e.show_slug)
      .eq('episode_id', e.episode_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    touched++
  }

  return NextResponse.json({ ok: true, touched })
}
