import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 記事の削除(2段階: ゴミ箱→完全消去)。事故予防のため:
// - trash: deleted_atを立て、statusをdraftに落とす(公開側から即座に消える)。
//   published_atは保持する=復元→再公開してもUpdatesに再掲されない(「1回だけ」原則)
// - restore: deleted_atを外す(draftのまま戻る。再公開はAndyがフォームから)
// - purge: ゴミ箱内(deleted_at not null)のものだけ物理削除できる。
//   直接の物理削除は受け付けない。参照が消えた画像は翌0:01のGCが回収する
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { ids?: string[]; action?: string }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { ids, action } = body
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 100 ||
    ids.some((id) => typeof id !== 'string' || !UUID_RE.test(id)) ||
    !['trash', 'restore', 'purge'].includes(action ?? '')
  ) {
    return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
  }

  const now = new Date().toISOString()
  let error: { message: string } | null = null
  let count = 0

  if (action === 'trash') {
    const res = await supabase
      .from('articles')
      .update({ deleted_at: now, status: 'draft', updated_at: now })
      .in('id', ids)
      .is('deleted_at', null)
      .select('id')
    error = res.error
    count = res.data?.length ?? 0
  } else if (action === 'restore') {
    const res = await supabase
      .from('articles')
      .update({ deleted_at: null, updated_at: now })
      .in('id', ids)
      .not('deleted_at', 'is', null)
      .select('id')
    error = res.error
    count = res.data?.length ?? 0
  } else {
    // purge: ゴミ箱内のものだけ物理削除(誤idや未ゴミ箱の行は対象にならない)
    const res = await supabase
      .from('articles')
      .delete()
      .in('id', ids)
      .not('deleted_at', 'is', null)
      .select('id')
    error = res.error
    count = res.data?.length ?? 0
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/notes')
  revalidatePath('/photography')
  revalidatePath('/updates')
  revalidatePath('/')
  return NextResponse.json({ ok: true, count })
}
