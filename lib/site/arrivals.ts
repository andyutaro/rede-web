import { createService } from '@/lib/supabase/service'

// その日に波形へ生えた線画を、生えた順に返す(2026-08-07)。
// deskの当日ページとアーカイブの末尾「今日来てくれた人」で使う。
// 遊びの意匠なので、多い日も画面を埋め尽くさないよう上限を置く
// (超えた分は出さない=数を競う表示にしない)。
const MAX = 120

export async function arrivalsOf(day: string): Promise<number[]> {
  const { data, error } = await createService()
    .from('arrivals')
    .select('kind')
    .eq('day', day)
    .order('created_at', { ascending: true })
    .limit(MAX)
  // テーブル未作成(マイグレーション未実行)でも画面を壊さない
  if (error || !data) return []
  return data.map((r) => Number(r.kind)).filter((k) => Number.isInteger(k) && k >= 0)
}
