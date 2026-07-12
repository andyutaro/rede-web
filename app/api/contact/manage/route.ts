import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 問い合わせの管理(studioのCONTACT室): 既読/未読・2段階削除。
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
    !['read', 'unread', 'trash', 'restore', 'purge'].includes(action ?? '')
  ) {
    return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const table = supabase.from('contact_messages')
  let error: { message: string } | null = null

  if (action === 'read') {
    error = (await table.update({ read_at: now }).in('id', ids).is('read_at', null)).error
  } else if (action === 'unread') {
    error = (await table.update({ read_at: null }).in('id', ids)).error
  } else if (action === 'trash') {
    error = (await table.update({ deleted_at: now }).in('id', ids).is('deleted_at', null)).error
  } else if (action === 'restore') {
    error = (await table.update({ deleted_at: null }).in('id', ids).not('deleted_at', 'is', null)).error
  } else {
    // purge: ゴミ箱内のみ物理削除(他と同じ2段階)
    error = (await table.delete().in('id', ids).not('deleted_at', 'is', null)).error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
