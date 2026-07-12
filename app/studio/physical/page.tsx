import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SelectTable from '../SelectTable'
import { articleRows } from '../articleRows'

export const dynamic = 'force-dynamic'

// Physical室(2026-07-12): 物理的な作品のアーカイブ。Photography室と同構造。
export default async function StudioPhysical({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const trash = tab === 'trash'
  const supabase = await createClient()

  let query = supabase
    .from('articles')
    .select('id, title, type, status, tags, published_at, created_at, deleted_at')
    .eq('type', 'physical')
    .order('created_at', { ascending: false })
  query = trash ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null)
  const { data: articles } = await query

  return (
    <>
      <h1 className="studio-h1">PHYSICAL</h1>
      <div className="studio-tabs">
        <Link href="/studio/physical" aria-current={!trash ? 'page' : undefined}>
          PHYSICAL
        </Link>
        <Link href="/studio/physical?tab=trash" aria-current={trash ? 'page' : undefined}>
          TRASH
        </Link>
      </div>
      {!trash && (
        <Link className="studio-new" href="/studio/physical/new">
          ＋ 新規作成
        </Link>
      )}
      <SelectTable
        rows={articleRows(articles ?? [], trash ? null : '/studio/physical')}
        mode={trash ? 'trash' : 'active'}
        endpoint="/api/article/delete"
        emptyText={trash ? 'ゴミ箱は空です' : '作品がまだありません'}
      />
    </>
  )
}
