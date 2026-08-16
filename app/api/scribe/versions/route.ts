import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// サーバー側に残っている「直前の版」の一覧(2026-08-16)。
// 本文が大きく縮む保存のたびにDBのトリガが1件残している(db/2026-08-16-scribe-versions.sql)。
// /desk/rescue から読む。認証必須=本人だけ。
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('scribe_day_versions')
    .select('id, date, html, saved_at')
    .order('saved_at', { ascending: false })
    .limit(20)

  // テーブル未作成(マイグレーション未実行)でも画面を壊さない
  if (error) return NextResponse.json({ versions: [] })
  return NextResponse.json({ versions: data ?? [] })
}
