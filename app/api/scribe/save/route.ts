import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 保存はユーザーのセッションに紐づくクライアントで行う(service_role keyは使わない)。
// RLSの"authenticated"ポリシーがそのまま「本人だけ書き込める」を担保する。
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { date?: string; html?: string; finalize?: boolean }
  try {
    // beforeunloadのsendBeaconはBlobで送るため、Content-Typeがtext/plain扱いになりうる。
    // request.json()ではなくtext()経由でパースして両方のケースを吸収する。
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { date, html, finalize } = body
  if (!date || typeof html !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'invalid date/html' }, { status: 400 })
  }

  const { error } = await supabase.from('scribe_days').upsert(
    {
      date,
      html,
      updated_at: new Date().toISOString(),
      ...(finalize ? { finalized_at: new Date().toISOString() } : {}),
    },
    { onConflict: 'date' }
  )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
