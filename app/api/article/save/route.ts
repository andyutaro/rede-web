import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Article保存(scribe保存と同じ設計): 書き込みはユーザーのセッションクライアント、
// RLSの"authenticated all"ポリシーで本人だけ書けることを担保。
// 楽観ロックはupdated_at照合(scribe_daysと同方式)。
//
// published_atは「最初にpublishedになった時刻」で固定し、以後の編集・再公開では
// 動かさない。Updatesの「新しく生まれたものだけが1回だけ流れる」原則がこれで守られる。
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: {
    id?: string
    title?: string
    html?: string
    type?: string
    status?: string
    tags?: string[]
    baseUpdatedAt?: string | null
  }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { id, baseUpdatedAt } = body
  if (
    typeof body.title !== 'string' ||
    typeof body.html !== 'string' ||
    !['article', 'photography'].includes(body.type ?? '') ||
    !['draft', 'published'].includes(body.status ?? '') ||
    !Array.isArray(body.tags) ||
    body.tags.some((t) => typeof t !== 'string')
  ) {
    return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const fields = {
    title: body.title,
    html: body.html,
    type: body.type,
    status: body.status,
    tags: body.tags,
    updated_at: now,
  }

  // 新規作成
  if (!id) {
    const { data, error } = await supabase
      .from('articles')
      .insert({ ...fields, published_at: body.status === 'published' ? now : null })
      .select('id, updated_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidate()
    return NextResponse.json({ ok: true, id: data.id, updatedAt: data.updated_at })
  }

  // 既存更新: published_atは未設定→published遷移のときだけ焼き込む
  const { data: current } = await supabase
    .from('articles')
    .select('published_at')
    .eq('id', id)
    .maybeSingle()
  if (!current) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const patch = {
    ...fields,
    ...(body.status === 'published' && !current.published_at ? { published_at: now } : {}),
  }

  const { data, error } = await supabase
    .from('articles')
    .update(patch)
    .eq('id', id)
    .eq('updated_at', baseUpdatedAt ?? '')
    .select('updated_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.length === 0) {
    const { data: latest } = await supabase
      .from('articles')
      .select('title, html, type, status, tags, updated_at')
      .eq('id', id)
      .maybeSingle()
    return NextResponse.json({ error: 'conflict', latest }, { status: 409 })
  }

  revalidate()
  return NextResponse.json({ ok: true, id, updatedAt: data[0].updated_at })
}

function revalidate() {
  // /articleとHomeはforce-dynamicだが、/updatesなどISR側があっても即反映されるように
  revalidatePath('/notes')
  revalidatePath('/updates')
  revalidatePath('/')
}
