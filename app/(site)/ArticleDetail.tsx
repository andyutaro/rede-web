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

type Shelf = 'notes' | 'photography' | 'physical'

const SHELF_LABEL: Record<Shelf, string> = {
  notes: 'NOTE',
  photography: 'PHOTO',
  physical: 'PHYSICAL',
}

// パンくずはナビと同じ語で名乗る。棚のURL(/notes・/photography)から機械的に
// 起こすと「Notes」「Photography」に戻ってしまうので、表記は表で持つ
// (2026-08-23: Photography→Photo、複数形→単数形に揃えた際に露見)
const SHELF_CRUMB: Record<Shelf, string> = {
  notes: 'Note',
  photography: 'Photo',
  physical: 'Physical',
}

// 棚名からDBのtypeへ。notes=article。physicalはもの(physical)と こと(event)の
// 2種を抱えるので複数(2026-08-07にEvents棚を吸収)
const SHELF_TYPES: Record<Shelf, string[]> = {
  notes: ['article'],
  photography: ['photography'],
  physical: ['physical', 'event'],
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
  if (type === 'physical' || type === 'event') return 'physical'
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
    // 棚名とDBのtypeは一致しない(notes=article、physical=physical+event)。
    // Physical棚ではもの と こと を混ぜて時系列に渡り歩く(一覧のALLと同じ並び)
    return q.in('type', SHELF_TYPES[shelf])
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

  // パンくず(2026-07-25): 検索結果の階層表示用。語彙はナビ表記に揃える
  const crumbs = breadcrumbJsonLd([
    { name: 'Home', path: '' },
    { name: SHELF_CRUMB[shelf], path: `/${shelf}` },
    { name: ((a.title as string) || '').trim() || '(無題)', path: `/${shelf}/${id}` },
  ])

  return (
    <div className="measure">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: crumbs }} />
      <article className="section">
        <div className="section-head">
          {/* 下位区分を種別として掲げる: photographyはARTWORK/PHOTOLOG(2026-07-11)、
              physical棚はOBJECT/EVENT(2026-08-07)。notesはBLOG
              (ARTICLE→BLOG 2026-08-13 Andy指定。DBのtype='article'は不変) */}
          <h2>
            {a.type === 'photography'
              ? ((a.photo_kind as string | null) ?? 'photolog').toUpperCase()
              : a.type === 'physical'
                ? 'OBJECT'
                : a.type === 'event'
                  ? 'EVENT'
                  : 'BLOG'}
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
