import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import SelectTable from '../SelectTable'
import { articleRows } from '../articleRows'

export const dynamic = 'force-dynamic'

// Photography室(2026-07-10独立: ARTICLE編集画面のtype選択から部屋の分離へ)。
// データはarticlesのtype=photography。ゴミ箱もこの部屋の中で完結する。
export default async function StudioPhotography({
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
    .eq('type', 'photography')
    .order('created_at', { ascending: false })
  query = trash ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null)
  const { data: articles } = await query

  return (
    <>
      <h1 className="studio-h1">PHOTOGRAPHY</h1>
      <div className="studio-tabs">
        <Link href="/studio/photography" aria-current={!trash ? 'page' : undefined}>
          PHOTOGRAPHY
        </Link>
        <Link href="/studio/photography?tab=trash" aria-current={trash ? 'page' : undefined}>
          TRASH
        </Link>
      </div>
      {!trash && (
        <Link className="studio-new" href="/studio/photography/new">
          ＋ 新規作成
        </Link>
      )}
      <SelectTable
        rows={articleRows(articles ?? [], trash ? null : '/studio/photography')}
        mode={trash ? 'trash' : 'active'}
        endpoint="/api/article/delete"
        emptyText={trash ? 'ゴミ箱は空です' : '作品がまだありません'}
      />
    </>
  )
}
