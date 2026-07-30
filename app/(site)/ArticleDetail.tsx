import { notFound, redirect } from 'next/navigation'
import { createService } from '@/lib/supabase/service'
import { dateDots, tokyoYmd } from '@/lib/site/text'
import { breadcrumbJsonLd } from '@/lib/site/breadcrumbs'
import Pager from './Pager'
import ScribeArchive from './desk/ScribeArchive'
import SamePeriod from './SamePeriod'
import { loadAnnotations } from '@/lib/site/annotations'
import { isEditor } from '@/lib/supabase/editor'

// 記事個別ページの共通実装(Notes / Photography / Physicalの3棚で共用)。
// 本文はscribeと同じSSOT(生HTML)なので、同じサニタイザ・同じ本文スタイルで描画する。
// 戻る・進むは同じ棚の中だけを渡り歩く。

type Shelf = 'notes' | 'photography' | 'physical' | 'events'

// 棚⇔type対応(typeがarticle以外はtype名=棚名。eventsだけは棚が複数形)
const SHELF_LABEL: Record<Shelf, string> = {
  notes: 'NOTES',
  photography: 'PHOTOGRAPHY',
  physical: 'PHYSICAL',
  events: 'EVENTS',
}

// 棚名からDBのtypeへ(notes=article、events=event、他は同名)
const SHELF_TYPE: Record<Shelf, string> = {
  notes: 'article',
  photography: 'photography',
  physical: 'physical',
  events: 'event',
}

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
  if (type === 'photography') return 'photography'
  if (type === 'physical') return 'physical'
  if (type === 'event') return 'events'
  return 'notes'
}

export default async function ArticleDetail({ id, shelf }: { id: string; shelf: Shelf }) {
  const a = await loadPublishedArticle(id)
  if (!a) notFound()

  // 棚とtypeが食い違うURL(格上げ前のリンク等)は正しい棚へ寄せる
  const home = shelfOf(a.type as string)
  if (home !== shelf) redirect(`/${home}/${id}`)

  const date = a.published_at ? tokyoYmd(a.published_at as string) : null

  // 戻る・進む: published_at順、同じ棚の中だけ
  const service = createService()
  const shelfQuery = () => {
    const q = service.from('articles').select('id, title').eq('status', 'published')
    // 棚名とDBのtypeは一致しないものがある(notes=article、events=event)
    return q.eq('type', SHELF_TYPE[shelf])
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

  // 注釈(2026-07-28): 本文とは別レイヤー。ログイン中は公開ページから直接足せる
  const [annotations, canEdit] = await Promise.all([
    loadAnnotations({ kind: 'article', key: id }),
    isEditor(),
  ])

  // パンくず(2026-07-25): 検索結果の階層表示用。語彙はナビ表記(Notes等)に揃える
  const crumbs = breadcrumbJsonLd([
    { name: 'Home', path: '' },
    { name: shelf.charAt(0).toUpperCase() + shelf.slice(1), path: `/${shelf}` },
    { name: ((a.title as string) || '').trim() || '(無題)', path: `/${shelf}/${id}` },
  ])

  return (
    <div className="measure">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: crumbs }} />
      <article className="section">
        <div className="section-head">
          {/* photographyは下位区分(ARTWORK/PHOTOLOG)を種別として掲げる(2026-07-11)。
              physicalはPHYSICAL、notesはARTICLE */}
          <h2>
            {a.type === 'photography'
              ? ((a.photo_kind as string | null) ?? 'photolog').toUpperCase()
              : a.type === 'physical'
                ? 'PHYSICAL'
                : a.type === 'event'
                  ? 'EVENT'
                  : 'ARTICLE'}
          </h2>
          {date && <span className="article-date">{dateDots(date)}</span>}
        </div>
        <h1 className="article-title">{a.title || '(無題)'}</h1>
        {/* 小さな説明(任意、photography/physical)。タイトル下に控えめに */}
        {a.type !== 'article' && (a.description as string | undefined)?.trim() && (
          <p className="article-description">{(a.description as string).trim()}</p>
        )}
        <ScribeArchive
          html={(a.html as string) ?? ''}
          annotations={annotations}
          canEdit={canEdit}
          target={{ kind: 'article', key: id }}
        />
        {/* 同じ頃(2026-07-28): 公開日の前後7日に生まれた他の仕事。
            同じ棚の前後の記事はPagerの担当なので除く。公開日が無ければ出さない */}
        {date && <SamePeriod date={date} excludePrefix={`/${shelf}/`} />}
        <Pager
          older={pagerLink(prevRes.data)}
          newer={pagerLink(nextRes.data)}
          back={{ href: `/${shelf}`, title: SHELF_LABEL[shelf] }}
        />
      </article>
    </div>
  )
}
