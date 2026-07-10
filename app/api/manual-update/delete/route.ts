import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 手動Updates行の削除(articlesと同じ2段階: trash→purge)。
// リクエスト形はSelectTable共通({ ids, action })
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

  if (action === 'trash') {
    const res = await supabase
      .from('manual_updates')
      .update({ deleted_at: now })
      .in('id', ids)
      .is('deleted_at', null)
    error = res.error
  } else if (action === 'restore') {
    const res = await supabase
      .from('manual_updates')
      .update({ deleted_at: null })
      .in('id', ids)
      .not('deleted_at', 'is', null)
    error = res.error
  } else {
    const res = await supabase
      .from('manual_updates')
      .delete()
      .in('id', ids)
      .not('deleted_at', 'is', null)
    error = res.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  revalidatePath('/updates')
  revalidatePath('/')
  return NextResponse.json({ ok: true })
}
