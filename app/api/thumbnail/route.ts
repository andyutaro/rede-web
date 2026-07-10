import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// サムネイルの手動差し替え/自動リセット(studioのTHUMBNAILS室)。
// - url指定: thumbnail_source='manual'で固定(自動ロジックより常に優先)
// - url=null: 焼き込みを消して自動(本文の最初の画像→充当)に戻す
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { target?: string; id?: string; url?: string | null }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { target, id, url } = body
  const validId =
    (target === 'scribe' && typeof id === 'string' && DATE_RE.test(id)) ||
    (target === 'article' && typeof id === 'string' && UUID_RE.test(id))
  const validUrl = url === null || (typeof url === 'string' && /^https:\/\//.test(url))
  if (!validId || !validUrl) {
    return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
  }

  const patch = url
    ? { thumbnail_url: url, thumbnail_source: 'manual' }
    : { thumbnail_url: null, thumbnail_source: null }

  const query =
    target === 'scribe'
      ? supabase.from('scribe_days').update(patch).eq('date', id!)
      : supabase.from('articles').update(patch).eq('id', id!)
  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/notes')
  revalidatePath('/photography')
  return NextResponse.json({ ok: true })
}
