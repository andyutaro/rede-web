import type { Metadata } from 'next'
import { createService } from '@/lib/supabase/service'
import { todayInTokyo } from '@/lib/scribe/date'
import { firstImageSrc, tokyoYmd } from '@/lib/site/text'
import { assignedOf, listAllImages } from '@/lib/site/photos'
import ArticleGrid, { type GridItem } from './ArticleGrid'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Note',
  description: 'Andyの書きもの。記事と、日々のscribeの確定アーカイブ。',
  alternates: { canonical: 'https://andyutaro.com/notes' },
}

// Article一覧(handoff-notes §6): scribe棚はここに統合。
// サムネイル決定(§11): ①本文の最初の画像 → ②プールから充当(一度決まったら固定)
// → ③管理画面から手動差し替え(thumbnail_source列)。
export default async function ArticlePage() {
  const service = createService()
  const today = todayInTokyo()

  // **本文HTMLを持ってこない(2026-09-01)。** ここは`select('*')`で
  // scribe_daysを丸ごと引いていた=71行・本文込みで6.6MBが、force-dynamicの
  // このページが開かれるたびにSupabaseから流れていた。8月のEgress 2.95GB/5GBの
  // 主因。サムネイルは既に列へ焼き込んであるので、一覧に本文は要らない。
  // 当日のLIVEセルだけは「本文が空でないか」を知る必要があるので、
  // 存在判定をサーバー側の絞り込みでやる(条件はDBで効かせ、本文は運ばない)。
  const [{ data: days }, liveRes, artRes, pool] = await Promise.all([
    service
      .from('scribe_days')
      .select('date, deleted_at, finalized_at, thumbnail_url, thumbnail_source')
      .order('date', { ascending: false }),
    service
      .from('scribe_days')
      .select('date')
      .eq('date', today)
      .is('finalized_at', null)
      .not('html', 'is', null)
      .neq('html', '')
      .maybeSingle(),
    service
      .from('articles')
      .select('id, title, type, html, thumbnail_url, thumbnail_source, published_at')
      .eq('status', 'published')
      // photography/physicalは独立棚。Notesはarticle+scribeのみ
      .eq('type', 'article')
      .order('published_at', { ascending: false }),
    listAllImages(),
  ])

  const items: GridItem[] = []
  // 焼き込み(サムネイルの昇格・充当固定)はレンダーをブロックしない:
  // ループ内で直列awaitせず集めて最後に並列実行(書き込みは差分がある日だけ=稀)
  const burnIns: PromiseLike<unknown>[] = []

  const liveHasBody = Boolean(liveRes.data)

  for (const row of days ?? []) {
    if (row.deleted_at) continue // ゴミ箱(studio)入りの日は公開一覧から消す
    const date = row.date as string
    const finalized = Boolean(row.finalized_at)

    // 当日執筆中のscribeはLIVEセル(§6)。ALL/SCRIBEタブでのみ表示
    if (!finalized) {
      if (date === today && liveHasBody) {
        items.push({ key: `live-${date}`, kind: 'live', date, href: '/live' })
      }
      continue
    }

    // 優先順位(2026-07-10改訂): manual > 本文の最初の画像 > 充当。
    // 本文画像への昇格(6/22で踏んだ問題の恒久対応)は、ここではなく
    // **書いた側**でやる(2026-09-01): 保存時にthumbnail_urlへ焼き込み、
    // 取りこぼしは毎晩のcronが本文を突き合わせて直す。表示のたびに全日分の
    // 本文を運んで導出し直すのは、同じ答えを出すための代金が高すぎた。
    let thumb: string | null = (row.thumbnail_url as string | null) ?? null
    let assigned = Boolean(thumb) && row.thumbnail_source === 'assigned'
    if (!thumb) {
      // 充当。決まったらその場で焼き込んで固定する
      thumb = assignedOf(pool, date)
      assigned = thumb !== null
      if (thumb) {
        burnIns.push(
          service
            .from('scribe_days')
            .update({ thumbnail_url: thumb, thumbnail_source: 'assigned' })
            .eq('date', date)
        )
      }
    }
    items.push({ key: `scribe-${date}`, kind: 'scribe', date, href: `/desk/${date}`, thumb, assigned })
  }
  if (burnIns.length > 0) await Promise.all(burnIns)

  if (!artRes.error) {
    for (const a of artRes.data ?? []) {
      if (!a.published_at) continue
      const date = tokyoYmd(a.published_at as string)
      const first = firstImageSrc((a.html as string) ?? '')
      const thumb = (a.thumbnail_url as string | null) ?? first ?? assignedOf(pool, a.id as string)
      items.push({
        key: `article-${a.id}`,
        kind: a.type === 'photography' ? 'photography' : 'article',
        date,
        href: `/notes/${a.id}`,
        title: (a.title as string) || '(無題)',
        thumb,
        assigned: !a.thumbnail_url && !first && Boolean(thumb),
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
      <h1 className="sr-only">Note</h1>
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
