import { NextResponse } from 'next/server'
import { backupPhotos } from '@/lib/site/backup'
import { buildShowSummary } from '@/lib/site/showSummary'

// 写真の控え専用のcron(2026-09-14)。3時間ごとにworker.jsのscheduledから呼ばれる。
//
// 夜のcron(/api/cron/finalize)も写真を控えるが、他の仕事と処理の上限を分け合うので
// 1晩6枚が限界だった。写真をまとめて上げると未処理が溜まり、何週間も追いつかない
// (2026-09-14に145枚)。こちらは控えだけをやるので1回20枚、1日160枚まで進む。
//
// 差分で写すので、夜のcronと同じ写真を二重に写すことはない(既にある控えは飛ばす)。
// 追いついた後は毎回0枚で、一覧を読んで終わる。
//
// **番組の作り置き(show_summary)もここで更新する(2026-09-22)。** Homeのカバー・
// 最新エピソード・UPDATEは夜0:01の作り置きを読むので、夜に配信された回がHomeに
// 出るのは翌日だった。ページ側のrevalidateをいくら短くしても、読む先が1日古いままでは
// 変わらない。3時間ごとに焼き直せば、配信当日のうちにHomeへ出る。
// RSSの往復は番組数ぶん(5本)だけで、閲覧者の描画には乗らない(cronの予算で走る)。
export async function GET(request: Request) {
  const auth = request.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  // 片方が失敗してももう片方は進める(写真の控えが止まっても番組の鮮度は保つ、逆も同じ)
  const [photos, summary] = await Promise.all([backupPhotos(), buildShowSummary()])
  const result = { ...photos, showSummary: summary }
  // Observabilityに残す。夜のcronの `[cron]` とは別の印にする
  // (日次点検は `[cron]` を探して夜の結果を読むので、混ざらないように)
  console.log('[cron-photos] ' + JSON.stringify(result))
  return NextResponse.json(result, { status: photos.error ? 500 : 200 })
}
