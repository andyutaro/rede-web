import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 毎日0:01 JST(15:01 UTC)にVercel Cronから呼ばれ、「いま終わった日」の
// scribe_daysにfinalized_atを立てる(仕様: アーカイブは毎日0:01に確定)。
//
// - 認証: Vercelが自動で付けるAuthorization: Bearer <CRON_SECRET>を検証
// - 冪等: すでにfinalized_atが立っている行は触らない(タブの日付跨ぎ検知による
//   既存の確定処理と二重発火しない)
// - Hobbyプランのcronは実行時刻が最大1時間程度ずれることがあるため、
//   「実行時点のJST日付の前日」を対象にする(ずれても対象日は変わらない)
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // JSTの「昨日」= いま0:01過ぎに終わったばかりの日
  const nowJst = new Date(Date.now() + 9 * 60 * 60 * 1000)
  nowJst.setUTCDate(nowJst.getUTCDate() - 1)
  const target = nowJst.toISOString().slice(0, 10)

  // cronはユーザーセッションを持たないため、ここだけservice roleで書く
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase
    .from('scribe_days')
    .update({ finalized_at: new Date().toISOString() })
    .eq('date', target)
    .is('finalized_at', null)
    .select('date')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({
    ok: true,
    target,
    finalized: (data ?? []).length > 0, // false = 行がない(その日書かなかった) or 確定済み
  })
}
