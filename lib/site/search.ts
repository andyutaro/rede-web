import { createService } from '@/lib/supabase/service'
import { htmlToPlainText } from './text'

export type SearchHit = {
  date: string
  before: string
  match: string
  after: string
}

// 抜粋の前後に見せる文字数。1行clip表示のため一致箇所を左寄りに出す
// (前を短く・後を長く)ことで、一致語が見切れないようにする。
const BEFORE = 12
const AFTER = 70

// 確定scribeアーカイブを部分一致で検索する。日本語のため語分割ではなく
// トライグラム/ILIKEの部分一致(pg_trgm索引が効く)。当日の未確定分は対象外。
export async function searchScribe(query: string): Promise<SearchHit[]> {
  const q = query.trim()
  if (!q) return []

  // LIKEのワイルドカード(% _)とエスケープ文字(\)を無効化してから囲む
  const escaped = q.replace(/[\\%_]/g, '\\$&')

  const service = createService()
  const { data, error } = await service
    .from('scribe_days')
    .select('date, html, finalized_at')
    .not('finalized_at', 'is', null)
    .ilike('html', `%${escaped}%`)
    .order('date', { ascending: false })
    .limit(100)

  if (error || !data) return []

  const hits: SearchHit[] = []
  for (const row of data) {
    const plain = htmlToPlainText((row.html as string) ?? '')
    const idx = plain.toLowerCase().indexOf(q.toLowerCase())
    if (idx < 0) continue // 一致がタグ/URL側にしかない稀なケースは落とす
    const start = Math.max(0, idx - BEFORE)
    const end = Math.min(plain.length, idx + q.length + AFTER)
    hits.push({
      date: row.date as string,
      before: (start > 0 ? '…' : '') + plain.slice(start, idx),
      match: plain.slice(idx, idx + q.length),
      after: plain.slice(idx + q.length, end) + (end < plain.length ? '…' : ''),
    })
  }
  return hits
}
