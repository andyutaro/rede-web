import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { firstImageThumbPatch } from '@/lib/site/thumbs'

// Article保存(scribe保存と同じ設計): 書き込みはユーザーのセッションクライアント、
// RLSの"authenticated all"ポリシーで本人だけ書けることを担保。
// 楽観ロックはupdated_at照合(scribe_daysと同方式)。
//
// published_atは「最初にpublishedになった時刻」で固定し、以後の編集・再公開では
// 動かさない。Updatesの「新しく生まれたものだけが1回だけ流れる」原則がこれで守られる。
//
// 例外はtype=eventだけ(2026-07-29): 催しは「記録した日」ではなく「開催した日」に
// 属する。過去の催しを後から記録するので、eventに限りeventDate(YYYY-MM-DD)で
// published_atを指定できる。棚の並び・「同じ頃」・パンくずがすべて開催日で揃う。
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
    photoKind?: string | null // photographyの下位区分(artwork/photolog)
    description?: string // 写真の小さな説明(photographyで使用)
    eventDate?: string | null // 催しの開催日(YYYY-MM-DD、eventでのみ有効)
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
    !['article', 'photography', 'physical', 'event'].includes(body.type ?? '') ||
    (body.eventDate != null && !/^\d{4}-\d{2}-\d{2}$/.test(body.eventDate)) ||
    !['draft', 'published'].includes(body.status ?? '') ||
    !Array.isArray(body.tags) ||
    body.tags.some((t) => typeof t !== 'string') ||
    (body.photoKind != null && !['artwork', 'photolog'].includes(body.photoKind)) ||
    (body.description != null && typeof body.description !== 'string') ||
    (body.description ?? '').length > 500
  ) {
    return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
  }

  const now = new Date().toISOString()
  // 催しの開催日。日付だけ渡ってくるので東京の正午に置く(日付境界でずれないため)
  const eventAt =
    body.type === 'event' && body.eventDate ? `${body.eventDate}T12:00:00+09:00` : null
  const fields = {
    title: body.title,
    html: body.html,
    type: body.type,
    status: body.status,
    tags: body.tags,
    // photographyの区分。articleではnullのまま
    photo_kind: body.type === 'photography' ? (body.photoKind ?? 'photolog') : null,
    description: (body.description ?? '').trim(),
    updated_at: now,
  }

  // 新規作成
  if (!id) {
    const { data, error } = await supabase
      .from('articles')
      .insert({
        ...fields,
        // 本文の最初の画像をサムネイルとして焼き込む(2026-09-01)。棚の一覧が
        // 表示のたびに本文を取り寄せて導出し直さなくて済むようにする
        ...(firstImageThumbPatch(body.html, {}) ?? {}),
        published_at: body.status === 'published' ? (eventAt ?? now) : null,
      })
      .select('id, updated_at')
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidate()
    return NextResponse.json({ ok: true, id: data.id, updatedAt: data.updated_at })
  }

  // 既存更新: published_atは未設定→published遷移のときだけ焼き込む
  const { data: current } = await supabase
    .from('articles')
    .select('published_at, thumbnail_url, thumbnail_source')
    .eq('id', id)
    .maybeSingle()
  if (!current) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const patch = {
    ...fields,
    // 本文が変わればサムネイルも追従させる(manualは触らない)。
    // 表示側で毎回導出し直していたものを、変わった瞬間の一度に移した
    ...(firstImageThumbPatch(body.html, current) ?? {}),
    // eventだけは開催日を後から直せる(告知の日付を間違えたまま固定されると困る)。
    // それ以外は従来どおり「最初にpublishedになった時刻」で固定
    ...(eventAt
      ? { published_at: eventAt }
      : body.status === 'published' && !current.published_at
        ? { published_at: now }
        : {}),
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
  // 各棚とHomeはforce-dynamicだが、/updatesなどISR側があっても即反映されるように
  revalidatePath('/notes')
  revalidatePath('/photography')
  revalidatePath('/physical')
  revalidatePath('/updates')
  revalidatePath('/')
}
