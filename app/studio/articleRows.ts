import type { SelectRow } from './SelectTable'
import { firstImageSrc, tokyoYmd } from '@/lib/site/text'
import { assignedOf } from '@/lib/site/photos'

// typeに対応するstudioの部屋パス(部屋違いURLの救済リダイレクト用)。
// article=NOTES室(2026-07-17改名、旧/studio/articles)
export function studioShelfPath(type: string): string {
  if (type === 'photography') return '/studio/photography'
  if (type === 'physical') return '/studio/physical'
  return '/studio/notes'
}

// サムネイルの実物と出所を行データへ(2026-07-17)。出所の意味:
// manual=その記事だけの専用設定 / first_image=本文の最初の画像 /
// assigned=他から参照(充当=借り物) / none=何も無い。
// 公開側の決定ロジック(manual > 本文 > 充当)と同じ優先順で実物を解決する
type ThumbRecord = {
  html?: string | null
  thumbnail_url?: string | null
  thumbnail_source?: string | null
}

export function thumbOf(
  rec: ThumbRecord,
  assignKey: string,
  pool: string[]
): Pick<SelectRow, 'thumb' | 'thumbSource'> {
  if (rec.thumbnail_source === 'manual' && rec.thumbnail_url) {
    return { thumb: rec.thumbnail_url, thumbSource: 'manual' }
  }
  const first = firstImageSrc((rec.html as string) ?? '')
  if (first) return { thumb: first, thumbSource: 'first_image' }
  const assigned = rec.thumbnail_url ?? assignedOf(pool, assignKey)
  if (assigned) return { thumb: assigned, thumbSource: 'assigned' }
  return { thumb: null, thumbSource: 'none' }
}

// articlesの行をSelectTable行へ変換(NOTES室/Photography室で共用)。
// hrefBase=nullでリンクなし(ゴミ箱=戻してから編集)。poolを渡すとサムネ列が付く
type ArticleRecord = {
  id: string
  title: string | null
  status: string
  tags: string[] | null
  published_at: string | null
  created_at: string
} & ThumbRecord

export function articleRows(
  articles: ArticleRecord[],
  hrefBase: string | null,
  pool?: string[]
): SelectRow[] {
  return articles.map((a) => ({
    id: a.id,
    date: tokyoYmd(a.published_at ?? a.created_at),
    label: a.status.toUpperCase(),
    published: a.status === 'published',
    title: (a.title || '').trim() || '(無題)',
    href: hrefBase ? `${hrefBase}/${a.id}` : undefined,
    tags: Array.isArray(a.tags) ? a.tags : [],
    ...(pool ? thumbOf(a, a.id, pool) : {}),
  }))
}
