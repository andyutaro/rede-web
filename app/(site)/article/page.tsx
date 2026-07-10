import type { Metadata } from 'next'
import { createService } from '@/lib/supabase/service'
import { todayInTokyo } from '@/lib/scribe/date'
import { firstImageSrc } from '@/lib/site/text'
import { assignedOf, listAllImages } from '@/lib/site/photos'
import ArticleGrid, { type GridItem } from './ArticleGrid'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Article' }

// Article一覧(handoff-notes §6): scribe棚はここに統合。
// サムネイル決定(§11): ①本文の最初の画像 → ②プールから充当(一度決まったら固定)
// → ③管理画面から手動差し替え(thumbnail_source列)。
export default async function ArticlePage() {
  const service = createService()
  const today = todayInTokyo()

  const [{ data: days }, artRes, pool] = await Promise.all([
    service.from('scribe_days').select('*').order('date', { ascending: false }),
    service
      .from('articles')
      .select('id, title, type, html, thumbnail_url, thumbnail_source, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false }),
    listAllImages(),
  ])

  const items: GridItem[] = []

  for (const row of days ?? []) {
    const date = row.date as string
    const html = (row.html as string) ?? ''
    const finalized = Boolean(row.finalized_at)

    // 当日執筆中のscribeはLIVEセル(§6)。ALL/SCRIBEタブでのみ表示
    if (!finalized) {
      if (date === today && html) {
        items.push({ key: `live-${date}`, kind: 'live', date, href: '/live' })
      }
      continue
    }

    let thumb: string | null = (row.thumbnail_url as string | null) ?? null
    let assigned = row.thumbnail_source === 'assigned'
    if (!thumb) {
      const first = firstImageSrc(html)
      if (first) {
        thumb = first
        assigned = false
      } else {
        // 充当。thumbnail_url列があればここで焼き込んで固定する
        // (列がまだ無い間はハッシュ選択が決定性を代替)
        thumb = assignedOf(pool, date)
        assigned = thumb !== null
        if (thumb && 'thumbnail_url' in row) {
          await service
            .from('scribe_days')
            .update({ thumbnail_url: thumb, thumbnail_source: 'assigned' })
            .eq('date', date)
        }
      }
    }
    items.push({ key: `scribe-${date}`, kind: 'scribe', date, href: `/scribe/${date}`, thumb, assigned })
  }

  if (!artRes.error) {
    for (const a of artRes.data ?? []) {
      if (!a.published_at) continue
      const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(
        new Date(a.published_at as string)
      )
      const thumb =
        (a.thumbnail_url as string | null) ??
        firstImageSrc((a.html as string) ?? '') ??
        assignedOf(pool, a.id as string)
      items.push({
        key: `article-${a.id}`,
        kind: a.type === 'photography' ? 'photography' : 'article',
        date,
        href: `/article/${a.id}`,
        title: (a.title as string) || '(無題)',
        thumb,
        assigned: !a.thumbnail_url && !firstImageSrc((a.html as string) ?? '') && Boolean(thumb),
      })
    }
  }

  // LIVEセルを先頭に、あとは日付降順
  items.sort((a, b) => {
    if (a.kind === 'live') return -1
    if (b.kind === 'live') return 1
    return a.date < b.date ? 1 : -1
  })

  return (
    <div className="measure">
      {/* scribeアーカイブ検索の入口(結果は/searchへ) */}
      <form className="article-search" action="/search" method="get">
        <input
          type="search"
          name="q"
          placeholder="アーカイブを検索"
          aria-label="アーカイブを検索"
        />
      </form>
      <ArticleGrid items={items} />
    </div>
  )
}
