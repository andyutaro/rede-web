import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { todayInTokyo } from '@/lib/scribe/date'
import SelectTable, { type SelectRow } from '../SelectTable'
import UpdateForm from './UpdateForm'

export const dynamic = 'force-dynamic'

// UPDATES室: 手動投稿(仕様: 「新しく生まれたものだけが流れる」の手動枠)。
// 投稿はラベル+本文+任意リンクの1行。削除は他と同じ2段階(TRASHタブ)。
export default async function StudioUpdates({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const trash = tab === 'trash'
  const supabase = await createClient()

  let query = supabase.from('manual_updates').select('*').order('date', { ascending: false })
  query = trash ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null)
  const { data } = await query

  const rows: SelectRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    date: r.date as string,
    label: ((r.label as string) ?? '').toUpperCase(),
    title: `${r.body}${r.href ? ` → ${r.href}` : ''}`,
  }))

  return (
    <>
      <h1 className="studio-h1">UPDATES</h1>
      <div className="studio-tabs">
        <Link href="/studio/updates" aria-current={!trash ? 'page' : undefined}>
          POSTS
        </Link>
        <Link href="/studio/updates?tab=trash" aria-current={trash ? 'page' : undefined}>
          TRASH
        </Link>
      </div>
      {!trash && <UpdateForm defaultDate={todayInTokyo()} />}
      <SelectTable
        rows={rows}
        mode={trash ? 'trash' : 'active'}
        endpoint="/api/manual-update/delete"
        emptyText={trash ? 'ゴミ箱は空です' : '手動投稿はまだありません'}
      />
    </>
  )
}
