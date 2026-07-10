import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 確定済みscribeの削除(articlesと同じ2段階: ゴミ箱→完全消去)。
// - trash: deleted_atを立てる(確定済みのみ対象。当日の執筆中は放送卓の領分なので不可)
// - restore: deleted_atを外す
// - purge: ゴミ箱内のものだけ物理削除。画像は翌0:01のGCが回収する
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

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
    ids.some((d) => typeof d !== 'string' || !DATE_RE.test(d)) ||
    !['trash', 'restore', 'purge'].includes(action ?? '')
  ) {
    return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
  }

  const now = new Date().toISOString()
  let error: { message: string } | null = null
  let count = 0

  if (action === 'trash') {
    const res = await supabase
      .from('scribe_days')
      .update({ deleted_at: now })
      .in('date', ids)
      .not('finalized_at', 'is', null) // 確定済みだけ(執筆中の当日は対象外)
      .is('deleted_at', null)
      .select('date')
    error = res.error
    count = res.data?.length ?? 0
  } else if (action === 'restore') {
    const res = await supabase
      .from('scribe_days')
      .update({ deleted_at: null })
      .in('date', ids)
      .not('deleted_at', 'is', null)
      .select('date')
    error = res.error
    count = res.data?.length ?? 0
  } else {
    const res = await supabase
      .from('scribe_days')
      .delete()
      .in('date', ids)
      .not('deleted_at', 'is', null)
      .select('date')
    error = res.error
    count = res.data?.length ?? 0
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/notes')
  revalidatePath('/updates')
  revalidatePath('/')
  return NextResponse.json({ ok: true, count })
}
