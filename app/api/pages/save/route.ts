import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// 固定ページ(contact/membership/privacy)のコンテンツ保存(2026-07-13)。
// Aboutの/api/about/saveと同方針: セッションクライアント+RLSで本人だけ書ける。
// dataは構造化済みJSON(studioのPageEditorがテキスト規約をパースして送る)。
const KEYS = ['contact', 'membership', 'privacy'] as const

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { key?: string; data?: unknown }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { key, data } = body
  if (!key || !(KEYS as readonly string[]).includes(key) || !data || typeof data !== 'object') {
    return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
  }

  const { error } = await supabase
    .from('site_content')
    .upsert({ key, data, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath(`/${key}`)
  return NextResponse.json({ ok: true })
}
