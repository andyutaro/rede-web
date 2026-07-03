import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 指定日の最新スナップショットを返す。タブがフォアグラウンドに戻ったときの
// 「他端末の更新の取り込み」に使う(楽観ロックの衝突をそもそも起きにくくする)。
export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('scribe_days')
    .select('html, updated_at')
    .eq('date', date)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ html: data?.html ?? '', updatedAt: data?.updated_at ?? null })
}
