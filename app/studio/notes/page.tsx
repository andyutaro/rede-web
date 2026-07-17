import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { firstImageSrc, scribeTitle } from '@/lib/site/text'
import { assignedOf, listAllImages } from '@/lib/site/photos'
import SelectTable, { type SelectRow } from '../SelectTable'
import { articleRows, thumbOf } from '../articleRows'
import ThumbGrid, { type ThumbItem } from '../ThumbGrid'

export const dynamic = 'force-dynamic'

// NOTES室(2026-07-17再編、旧ARTICLES室)。公開棚の改名(Article→Notes)に追従し、
// 上部メニューの分散(PAGES/PHYSICAL/THUMBNAILS独立室)をタブとしてここに統合。
// タブ: ARTICLE / SCRIBE / PHYSICAL / PAGES / THUMBNAILS / TRASH。
// 各一覧行にはサムネイルの実物と出所バッジ(専用/本文/充当/なし)を出す
// =「自前サムネの無い記事」を探す手間をなくす(2026-07-17 Andy要望)。
const TABS = [
  { key: 'article', label: 'ARTICLE' },
  { key: 'scribe', label: 'SCRIBE' },
  { key: 'physical', label: 'PHYSICAL' },
  { key: 'pages', label: 'PAGES' },
  { key: 'thumbnails', label: 'THUMBNAILS' },
  { key: 'trash', label: 'TRASH' },
] as const
type TabKey = (typeof TABS)[number]['key']

// 固定ページ(PAGESタブ)。Aboutはレイアウト付き専用エディタへ誘導
const PAGES = [
  { key: 'contact', label: 'CONTACT', href: '/studio/pages/contact' },
  { key: 'membership', label: 'MEMBERSHIP', href: '/studio/pages/membership' },
  { key: 'privacy', label: 'PRIVACY POLICY', href: '/studio/pages/privacy' },
  { key: 'about', label: 'ABOUT（専用エディタ →/desk/about）', href: '/desk/about' },
]

const ARTICLE_COLS = 'id, title, type, status, tags, published_at, created_at, deleted_at'
const THUMB_COLS = 'html, thumbnail_url, thumbnail_source'

export default async function StudioNotes({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab: rawTab } = await searchParams
  const tab: TabKey = (TABS.find((t) => t.key === rawTab)?.key ?? 'article') as TabKey
  const supabase = await createClient()

  let body: React.ReactNode = null

  if (tab === 'article' || tab === 'physical') {
    const type = tab === 'article' ? 'article' : 'physical'
    const editorBase = tab === 'article' ? '/studio/notes' : '/studio/physical'
    const [{ data: articles }, pool] = await Promise.all([
      supabase
        .from('articles')
        .select(`${ARTICLE_COLS}, ${THUMB_COLS}`)
        .eq('type', type)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      listAllImages(),
    ])
    body = (
      <>
        <Link className="studio-new" href={`${editorBase}/new`}>
          ＋ 新規作成
        </Link>
        <SelectTable
          rows={articleRows(articles ?? [], editorBase, pool)}
          mode="active"
          endpoint="/api/article/delete"
          emptyText={tab === 'article' ? '記事がまだありません' : '作品がまだありません'}
        />
      </>
    )
  }

  if (tab === 'scribe') {
    const [{ data: days }, pool] = await Promise.all([
      supabase
        .from('scribe_days')
        .select(`date, finalized_at, deleted_at, ${THUMB_COLS}`)
        .not('finalized_at', 'is', null)
        .is('deleted_at', null)
        .order('date', { ascending: false }),
      listAllImages(),
    ])
    const rows: SelectRow[] = (days ?? []).map((d) => {
      const t = thumbOf(d, d.date as string, pool)
      return {
        id: d.date as string,
        date: d.date as string,
        label: 'FINALIZED',
        title: `SCRIBE — ${scribeTitle(d.date as string)}`,
        href: `/studio/scribe/${d.date}`,
        ...t,
      }
    })
    body = (
      <SelectTable
        rows={rows}
        mode="active"
        endpoint="/api/scribe/delete"
        emptyText="確定済みのscribeがありません"
      />
    )
  }

  if (tab === 'pages') {
    body = (
      <div>
        {PAGES.map((p) => (
          <div className="studio-row" key={p.key}>
            <Link className="row-title" href={p.href}>
              {p.label}
            </Link>
          </div>
        ))}
      </div>
    )
  }

  if (tab === 'thumbnails') {
    // 旧THUMBNAILS室(2026-07-17タブ化): 3状態の確認と手動差し替え
    const [{ data: days }, { data: articles }, pool] = await Promise.all([
      supabase
        .from('scribe_days')
        .select(`date, deleted_at, finalized_at, ${THUMB_COLS}`)
        .not('finalized_at', 'is', null)
        .is('deleted_at', null)
        .order('date', { ascending: false }),
      supabase
        .from('articles')
        .select(`id, title, type, created_at, deleted_at, ${THUMB_COLS}`)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      listAllImages(),
    ])
    const items: ThumbItem[] = []
    for (const a of articles ?? []) {
      const first = firstImageSrc((a.html as string) ?? '')
      items.push({
        target: 'article',
        id: a.id as string,
        title: `${(a.type as string) === 'article' ? 'ARTICLE' : (a.type as string).toUpperCase()} — ${((a.title as string) || '').trim() || '(無題)'}`,
        thumb:
          a.thumbnail_source === 'manual'
            ? (a.thumbnail_url as string)
            : (first ?? (a.thumbnail_url as string | null) ?? assignedOf(pool, a.id as string)),
        source: (a.thumbnail_source as string | null) ?? (first ? 'first_image' : 'assigned'),
      })
    }
    for (const d of days ?? []) {
      const first = firstImageSrc((d.html as string) ?? '')
      items.push({
        target: 'scribe',
        id: d.date as string,
        title: `SCRIBE — ${scribeTitle(d.date as string)}`,
        thumb:
          d.thumbnail_source === 'manual'
            ? (d.thumbnail_url as string)
            : (first ?? (d.thumbnail_url as string | null) ?? assignedOf(pool, d.date as string)),
        source: (d.thumbnail_source as string | null) ?? (first ? 'first_image' : 'assigned'),
      })
    }
    body = <ThumbGrid items={items} pool={pool} />
  }

  if (tab === 'trash') {
    // ゴミ箱: ARTICLE/SCRIBE/PHYSICALをまとめて(完全消去はここからのみ=2段階)
    const [{ data: articles }, { data: physicals }, { data: days }] = await Promise.all([
      supabase
        .from('articles')
        .select(ARTICLE_COLS)
        .eq('type', 'article')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('articles')
        .select(ARTICLE_COLS)
        .eq('type', 'physical')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false }),
      supabase
        .from('scribe_days')
        .select('date, deleted_at')
        .not('deleted_at', 'is', null)
        .order('date', { ascending: false }),
    ])
    const scribeRows: SelectRow[] = (days ?? []).map((d) => ({
      id: d.date as string,
      date: d.date as string,
      label: 'SCRIBE',
      title: `SCRIBE — ${scribeTitle(d.date as string)}`,
    }))
    body = (
      <>
        <div className="studio-trash-section">
          <div className="studio-trash-head">ARTICLE</div>
          <SelectTable rows={articleRows(articles ?? [], null)} mode="trash" endpoint="/api/article/delete" emptyText="ゴミ箱は空です" />
        </div>
        <div className="studio-trash-section">
          <div className="studio-trash-head">SCRIBE</div>
          <SelectTable rows={scribeRows} mode="trash" endpoint="/api/scribe/delete" emptyText="ゴミ箱は空です" />
        </div>
        <div className="studio-trash-section">
          <div className="studio-trash-head">PHYSICAL</div>
          <SelectTable rows={articleRows(physicals ?? [], null)} mode="trash" endpoint="/api/article/delete" emptyText="ゴミ箱は空です" />
        </div>
      </>
    )
  }

  return (
    <>
      <h1 className="studio-h1">NOTES</h1>
      <div className="studio-tabs">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === 'article' ? '/studio/notes' : `/studio/notes?tab=${t.key}`}
            aria-current={tab === t.key ? 'page' : undefined}
          >
            {t.label}
          </Link>
        ))}
      </div>
      {body}
    </>
  )
}
