import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { scribeTitle } from '@/lib/site/text'
import SelectTable, { type SelectRow } from '../SelectTable'
import { articleRows } from '../articleRows'

export const dynamic = 'force-dynamic'

// Articles室: type=articleのみ(photographyは独立室 /studio/photography)。
// SCRIBEタブ=確定済みscribe_days(修正導線+選択ゴミ箱)。
// TRASHタブ=記事とscribeのゴミ箱(完全消去はここからのみ=事故予防の2段階)。
export default async function StudioArticles({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const supabase = await createClient()

  if (tab === 'scribe') {
    const { data: days } = await supabase
      .from('scribe_days')
      .select('date, finalized_at, deleted_at')
      .not('finalized_at', 'is', null)
      .is('deleted_at', null)
      .order('date', { ascending: false })

    const rows: SelectRow[] = (days ?? []).map((d) => ({
      id: d.date as string,
      date: d.date as string,
      label: 'FINALIZED',
      title: `SCRIBE — ${scribeTitle(d.date as string)}`,
      href: `/studio/scribe/${d.date}`,
    }))

    return (
      <>
        <h1 className="studio-h1">ARTICLES</h1>
        <Tabs active="scribe" />
        <SelectTable
          rows={rows}
          mode="active"
          endpoint="/api/scribe/delete"
          emptyText="確定済みのscribeがありません"
        />
      </>
    )
  }

  if (tab === 'trash') {
    const [{ data: articles }, { data: days }] = await Promise.all([
      supabase
        .from('articles')
        .select('id, title, type, status, tags, published_at, created_at, deleted_at')
        .eq('type', 'article')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('scribe_days')
        .select('date, deleted_at')
        .not('deleted_at', 'is', null)
        .order('date', { ascending: false }),
    ])

    const artRows = articleRows(articles ?? [], null)
    const scribeRows: SelectRow[] = (days ?? []).map((d) => ({
      id: d.date as string,
      date: d.date as string,
      label: 'SCRIBE',
      title: `SCRIBE — ${scribeTitle(d.date as string)}`,
    }))

    return (
      <>
        <h1 className="studio-h1">ARTICLES</h1>
        <Tabs active="trash" />
        <div className="studio-trash-section">
          <div className="studio-trash-head">ARTICLE</div>
          <SelectTable rows={artRows} mode="trash" endpoint="/api/article/delete" emptyText="ゴミ箱は空です" />
        </div>
        <div className="studio-trash-section">
          <div className="studio-trash-head">SCRIBE</div>
          <SelectTable rows={scribeRows} mode="trash" endpoint="/api/scribe/delete" emptyText="ゴミ箱は空です" />
        </div>
      </>
    )
  }

  const { data: articles } = await supabase
    .from('articles')
    .select('id, title, type, status, tags, published_at, created_at, deleted_at')
    .eq('type', 'article')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  return (
    <>
      <h1 className="studio-h1">ARTICLES</h1>
      <Tabs active="articles" />
      <Link className="studio-new" href="/studio/articles/new">
        ＋ 新規作成
      </Link>
      <SelectTable
        rows={articleRows(articles ?? [], '/studio/articles')}
        mode="active"
        endpoint="/api/article/delete"
        emptyText="記事がまだありません"
      />
    </>
  )
}

function Tabs({ active }: { active: 'articles' | 'scribe' | 'trash' }) {
  return (
    <div className="studio-tabs">
      <Link href="/studio/articles" aria-current={active === 'articles' ? 'page' : undefined}>
        ARTICLE
      </Link>
      <Link href="/studio/articles?tab=scribe" aria-current={active === 'scribe' ? 'page' : undefined}>
        SCRIBE
      </Link>
      <Link href="/studio/articles?tab=trash" aria-current={active === 'trash' ? 'page' : undefined}>
        TRASH
      </Link>
    </div>
  )
}
