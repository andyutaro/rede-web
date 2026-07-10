import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Updates手動投稿の作成。ラベル(種別列)+本文(タイトル列)+任意リンク。
// hrefは内部パス(/…)またはhttpsのみ許可(外部由来文字列の原則に準拠)
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { date?: string; label?: string; body?: string; href?: string }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const date = body.date ?? ''
  const label = (body.label ?? '').trim()
  const text = (body.body ?? '').trim()
  const href = (body.href ?? '').trim()
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !label ||
    label.length > 20 ||
    !text ||
    text.length > 300 ||
    (href && !/^(\/|https:\/\/)/.test(href))
  ) {
    return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('manual_updates')
    .insert({ date, label, body: text, href: href || null })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/updates')
  revalidatePath('/')
  return NextResponse.json({ ok: true, id: data.id })
}
