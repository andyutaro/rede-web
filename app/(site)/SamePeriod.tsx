import { samePeriod } from '@/lib/site/samePeriod'
import UpdateList from './UpdateList'

// 「同じ頃」の窓(2026-07-28 Andy指定): その日付の前後7日に生まれた他の仕事。
// 日付を鍵にサイト全体を結ぶ。中身が無い日はブロックごと出さない(空の器を置かない)。
// 見出しは持たせず、既存の小さなキャプション文法(listen-caption)に合わせる。
export default async function SamePeriod({
  date,
  excludePrefix,
}: {
  date: string
  excludePrefix: string
}) {
  const rows = await samePeriod(date, excludePrefix)
  if (rows.length === 0) return null
  return (
    <div className="same-period">
      <div className="listen-caption">同じ頃の作品</div>
      <UpdateList rows={rows} />
    </div>
  )
}
