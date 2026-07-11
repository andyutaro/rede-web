import { notFound, redirect } from 'next/navigation'
import { createService } from '@/lib/supabase/service'
import { dateDots } from '@/lib/site/text'
import Pager from './Pager'
import ScribeArchive from './scribe/ScribeArchive'

// 記事個別ページの共通実装(Notes / Photographyの2棚で共用、2026-07-10格上げ)。
// 本文はscribeと同じSSOT(生HTML)なので、同じサニタイザ・同じ本文スタイルで描画する。
// 戻る・進むは同じ棚の中だけを渡り歩く。

type Shelf = 'notes' | 'photography'

// UUID以外はDBに問い合わせない(不正パスの早期404)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function loadPublishedArticle(id: string) {
  if (!UUID_RE.test(id)) return null
  const service = createService()
  // publishedのみ絞り込み厳守(draftはサービスクライアントでも公開しない)。
  // '*': photo_kind/description等の後発列がマイグレーション未実行でも壊れない
  const { data } = await service
    .from('articles')
    .select('*')
    .eq('id', id)
    .eq('status', 'published')
    .maybeSingle()
  return data && !data.deleted_at ? data : null
}

function shelfOf(type: string): Shelf {
  return type === 'photography' ? 'photography' : 'notes'
}

export default async function ArticleDetail({ id, shelf }: { id: string; shelf: Shelf }) {
  const a = await loadPublishedArticle(id)
  if (!a) notFound()

  // 棚とtypeが食い違うURL(格上げ前のリンク等)は正しい棚へ寄せる
  const home = shelfOf(a.type as string)
  if (home !== shelf) redirect(`/${home}/${id}`)

  const date = a.published_at
    ? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(
        new Date(a.published_at as string)
      )
    : null

  // 戻る・進む: published_at順、同じ棚の中だけ
  const service = createService()
  const shelfQuery = () => {
    const q = service.from('articles').select('id, title').eq('status', 'published')
    return shelf === 'photography' ? q.eq('type', 'photography') : q.neq('type', 'photography')
  }
  const [prevRes, nextRes] = await Promise.all([
    a.published_at
      ? shelfQuery()
          .lt('published_at', a.published_at)
          .order('published_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    a.published_at
      ? shelfQuery()
          .gt('published_at', a.published_at)
          .order('published_at', { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  const pagerLink = (row: { id: string; title: string } | null) =>
    row ? { href: `/${shelf}/${row.id}`, title: (row.title || '').trim() || '無題' } : null

  return (
    <div className="measure">
      <article className="section">
        <div className="section-head">
          {/* photographyは下位区分(ARTWORK/PHOTOLOG)を種別として掲げる(2026-07-11) */}
          <span>
            {a.type === 'photography'
              ? ((a.photo_kind as string | null) ?? 'photolog').toUpperCase()
              : 'ARTICLE'}
          </span>
          {date && <span className="article-date">{dateDots(date)}</span>}
        </div>
        <h1 className="article-title">{a.title || '(無題)'}</h1>
        {/* 写真の小さな説明(任意)。タイトル下に控えめに */}
        {a.type === 'photography' && (a.description as string | undefined)?.trim() && (
          <p className="article-description">{(a.description as string).trim()}</p>
        )}
        <ScribeArchive html={(a.html as string) ?? ''} />
        <Pager
          older={pagerLink(prevRes.data)}
          newer={pagerLink(nextRes.data)}
          back={
            shelf === 'photography'
              ? { href: '/photography', title: 'PHOTOGRAPHY' }
              : { href: '/notes', title: 'NOTES' }
          }
        />
      </article>
    </div>
  )
}
