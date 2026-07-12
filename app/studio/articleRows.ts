import type { SelectRow } from './SelectTable'

// typeに対応するstudioの部屋パス(部屋違いURLの救済リダイレクト用)
export function studioShelfPath(type: string): string {
  if (type === 'photography') return '/studio/photography'
  if (type === 'physical') return '/studio/physical'
  return '/studio/articles'
}

// articlesの行をSelectTable行へ変換(Articles室/Photography室で共用)。
// hrefBase=nullでリンクなし(ゴミ箱=戻してから編集)
type ArticleRecord = {
  id: string
  title: string | null
  status: string
  tags: string[] | null
  published_at: string | null
  created_at: string
}

export function articleRows(articles: ArticleRecord[], hrefBase: string | null): SelectRow[] {
  return articles.map((a) => ({
    id: a.id,
    date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(
      new Date(a.published_at ?? a.created_at)
    ),
    label: a.status.toUpperCase(),
    published: a.status === 'published',
    title: (a.title || '').trim() || '(無題)',
    href: hrefBase ? `${hrefBase}/${a.id}` : undefined,
    tags: Array.isArray(a.tags) ? a.tags : [],
  }))
}
