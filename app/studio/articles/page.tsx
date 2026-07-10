import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { dateDots } from '@/lib/site/text'
import ArticlesTable, { type ArticleRow } from './ArticlesTable'

export const dynamic = 'force-dynamic'

// Articles一覧: draft/published両方(セッションクライアント+RLS authenticatedで
// draftも読める)。scribeタブは確定済みscribe_daysの修正導線。
// TRASHタブ=ゴミ箱(deleted_at not null)。完全消去はゴミ箱からのみ(事故予防の2段階)。
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
      .select('date, finalized_at')
      .not('finalized_at', 'is', null)
      .order('date', { ascending: false })

    return (
      <>
        <h1 className="studio-h1">ARTICLES</h1>
        <Tabs active="scribe" />
        <div>
          {(days ?? []).map((d) => (
            <div className="studio-row" key={d.date}>
              <span className="row-date">{dateDots(d.date)}</span>
              <span className="row-status">FINALIZED</span>
              <Link className="row-title" href={`/studio/scribe/${d.date}`}>
                SCRIBE — {(d.date as string).replaceAll('-', '')}
              </Link>
            </div>
          ))}
          {(days ?? []).length === 0 && <p className="studio-empty">確定済みのscribeがありません</p>}
        </div>
      </>
    )
  }

  const trash = tab === 'trash'
  let query = supabase
    .from('articles')
    .select('id, title, type, status, tags, published_at, created_at, deleted_at')
    .order('created_at', { ascending: false })
  query = trash ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null)
  const { data: articles } = await query

  const rows: ArticleRow[] = (articles ?? []).map((a) => ({
    id: a.id as string,
    title: (a.title as string) ?? '',
    type: a.type as string,
    status: a.status as string,
    tags: Array.isArray(a.tags) ? (a.tags as string[]) : [],
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(
      new Date((a.published_at ?? a.created_at) as string)
    ),
  }))

  return (
    <>
      <h1 className="studio-h1">ARTICLES</h1>
      <Tabs active={trash ? 'trash' : 'articles'} />
      {!trash && (
        <Link className="studio-new" href="/studio/articles/new">
          ＋ 新規作成
        </Link>
      )}
      <ArticlesTable rows={rows} mode={trash ? 'trash' : 'active'} />
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
