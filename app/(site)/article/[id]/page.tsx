import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createService } from '@/lib/supabase/service'
import { dateDots } from '@/lib/site/text'
import Pager from '../../Pager'
import ScribeArchive from '../../scribe/ScribeArchive'

export const dynamic = 'force-dynamic'

type Params = { id: string }

// UUID以外はDBに問い合わせない(不正パスの早期404)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function loadArticle(id: string) {
  if (!UUID_RE.test(id)) return null
  const service = createService()
  // publishedのみ絞り込み厳守(draftはサービスクライアントでも公開しない)
  const { data } = await service
    .from('articles')
    .select('id, title, html, type, published_at')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle()
  return data
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { id } = await params
  const a = await loadArticle(id)
  return { title: a?.title || 'Article' }
}

// 記事個別ページ。本文はscribeと同じSSOT(生HTML)なので、
// 同じサニタイザ・同じ本文スタイルで描画する。
export default async function ArticlePage({ params }: { params: Promise<Params> }) {
  const { id } = await params
  const a = await loadArticle(id)
  if (!a) notFound()

  const date = a.published_at
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(
        new Date(a.published_at as string)
      )
    : null

  // 戻る・進む: published_at順で前後のpublished記事を渡り歩く
  const service = createService()
  const [prevRes, nextRes] = await Promise.all([
    a.published_at
      ? service
          .from('articles')
          .select('id, title')
          .eq('status', 'published')
          .lt('published_at', a.published_at)
          .order('published_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    a.published_at
      ? service
          .from('articles')
          .select('id, title')
          .eq('status', 'published')
          .gt('published_at', a.published_at)
          .order('published_at', { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const pagerLink = (row: { id: string; title: string } | null) =>
    row ? { href: `/article/${row.id}`, title: (row.title || '').trim() || '無題' } : null

  return (
    <div className="measure">
      <article className="section">
        <div className="section-head">
          <span>{a.type === 'photography' ? 'PHOTOGRAPHY' : 'ARTICLE'}</span>
          {date && <span className="article-date">{dateDots(date)}</span>}
        </div>
        <h1 className="article-title">{a.title || '(無題)'}</h1>
        <ScribeArchive html={(a.html as string) ?? ''} />
        <Pager older={pagerLink(prevRes.data)} newer={pagerLink(nextRes.data)} />
      </article>
    </div>
  )
}
