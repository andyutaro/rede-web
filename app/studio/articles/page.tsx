import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { dateDots } from '@/lib/site/text'

export const dynamic = 'force-dynamic'

// Articles一覧: draft/published両方(セッションクライアント+RLS authenticatedで
// draftも読める)。scribeタブは確定済みscribe_daysの修正導線(放送卓とは別筐体、
// 確定後の所有権は管理画面へ一方通行)。
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
      .select('date, html, finalized_at')
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

  const { data: articles } = await supabase
    .from('articles')
    .select('id, title, type, status, tags, published_at, created_at, updated_at')
    .order('created_at', { ascending: false })

  return (
    <>
      <h1 className="studio-h1">ARTICLES</h1>
      <Tabs active="articles" />
      <Link className="studio-new" href="/studio/articles/new">
        ＋ 新規作成
      </Link>
      <div>
        {(articles ?? []).map((a) => {
          const date = (a.published_at ?? a.created_at) as string
          return (
            <div className="studio-row" key={a.id}>
              <span className="row-date">
                {dateDots(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date(date)))}
              </span>
              <span className={`row-status ${a.status}`}>
                {(a.status as string).toUpperCase()}
                {a.type === 'photography' ? ' / PHOTO' : ''}
              </span>
              <Link className="row-title" href={`/studio/articles/${a.id}`}>
                {a.title || '(無題)'}
              </Link>
              {Array.isArray(a.tags) && a.tags.length > 0 && (
                <span className="row-tags">{a.tags.join(' / ')}</span>
              )}
            </div>
          )
        })}
        {(articles ?? []).length === 0 && (
          <p className="studio-empty">記事がまだありません(articlesテーブル未作成の場合はdb/のSQLを実行)</p>
        )}
      </div>
    </>
  )
}

function Tabs({ active }: { active: 'articles' | 'scribe' }) {
  return (
    <div className="studio-tabs">
      <Link href="/studio/articles" aria-current={active === 'articles' ? 'page' : undefined}>
        ARTICLE
      </Link>
      <Link href="/studio/articles?tab=scribe" aria-current={active === 'scribe' ? 'page' : undefined}>
        SCRIBE
      </Link>
    </div>
  )
}
