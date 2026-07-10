import { createService } from '@/lib/supabase/service'
import { scribeTitle, htmlToPlainText } from './text'
import { todayInTokyo } from '@/lib/scribe/date'
import { SHOWS } from './shows'
import { fetchShowFeed } from './podcastFeed'

// 更新リストの1行: 日付+ラベル+タイトル。
// scribeはタイトル=日付導出(20260706)、Podcastはラベル=番組名/タイトル=『…』配信、
// Article/Photographyはラベルのみ。labelが無ければkindを大文字表示。
export type UpdateRow = {
  date: string // YYYY-MM-DD
  kind: 'scribe' | 'Article' | 'Photography' | 'Podcast'
  label?: string // ラベル列の表示を上書き(Podcast=番組名など)
  excerpt?: string // タイトル列
  href: string
  live?: boolean // 当日執筆中(未確定)の行。他は確定=「生まれたもの」だが、当日分だけ例外的に載せる
}

// Homeのミニマル表記でエピソードタイトルを厳しめに切る文字数(コードポイント数)。
// 絵文字(🐟等サロゲートペア)を割らないよう[...s]で数える。
const HOME_TITLE_MAX = 16
function clip(s: string, n: number): string {
  const chars = [...s]
  return chars.length > n ? chars.slice(0, n).join('') + '…' : s
}

// 「新しく生まれたものだけが流れる」: 対象は日次scribe確定・published記事・新エピソード着信。
// エピソードの"誕生"はpubDate。編集ではpubDateが変わらないため再掲されない(原則に合致)。
// compact: HomeのLAST 10 DAYS用。Podcastのエピソードタイトルを厳しめに切って「…」で省略する。
export async function recentUpdates(limit = 10, compact = false): Promise<UpdateRow[]> {
  const service = createService()

  const { data: days } = await service
    .from('scribe_days')
    .select('date, html, finalized_at')
    .not('finalized_at', 'is', null)
    .order('date', { ascending: false })
    .limit(limit)

  const rows: UpdateRow[] = (days ?? []).map((d) => ({
    date: d.date as string,
    kind: 'scribe',
    // scribeはNotes棚の配下なのでラベル=NOTES。タイトルは「SCRIBE『20260706』」
    label: 'NOTES',
    excerpt: `SCRIBE『${scribeTitle(d.date as string)}』`,
    href: `/scribe/${d.date}`,
  }))

  // 当日分(未確定=上のクエリに含まれない)を、確定行と同じ形式で先頭に載せる。
  // 何か書かれている日だけ(空の日は載せない)。liveフラグでドットを付ける。href=当日ライブ全文。
  const today = todayInTokyo()
  const { data: todayRow } = await service
    .from('scribe_days')
    .select('html, finalized_at')
    .eq('date', today)
    .maybeSingle()
  if (todayRow && !todayRow.finalized_at && htmlToPlainText(todayRow.html as string).length > 0) {
    rows.push({
      date: today,
      kind: 'scribe',
      label: 'NOTES',
      excerpt: `SCRIBE『${scribeTitle(today)}』`,
      href: '/live',
      live: true,
    })
  }

  // articlesテーブルはマイグレーション後に有効になる(未作成ならerrorで空のまま)
  const { data: articles, error } = await service
    .from('articles')
    .select('id, title, type, published_at')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit)

  if (!error) {
    for (const a of articles ?? []) {
      if (!a.published_at) continue
      // タイトルは現在値を都度読む(後から付けたタイトルもここに反映される)。
      // 空のまま公開された記事は空欄ではなく(無題)を出す。
      // 表記はscribe行と同型: ラベル=NOTES(棚) / タイトル=種別『…』
      const title = ((a.title as string) ?? '').trim() || '無題'
      const typeLabel = a.type === 'photography' ? 'PHOTOGRAPHY' : 'ARTICLE'
      rows.push({
        date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(
          new Date(a.published_at as string)
        ),
        kind: a.type === 'photography' ? 'Photography' : 'Article',
        label: 'NOTES',
        excerpt: `${typeLabel}『${compact ? clip(title, HOME_TITLE_MAX) : title}』`,
        href: `/notes/${a.id}`,
      })
    }
  }

  // 各番組の直近エピソード(RSS)。フィードは番組ページ等と共有キャッシュ。
  // sinceで旧番組の混入を除去(BrandShift)。マージ後にlimitで切るので各番組はlimit件で十分。
  const feeds = await Promise.all(
    SHOWS.map((s) => (s.feed ? fetchShowFeed(s.feed, s.since) : Promise.resolve(null)))
  )
  SHOWS.forEach((s, i) => {
    const feed = feeds[i]
    if (!feed) return
    const showName = s.shortName ?? s.name // 「ロングポスト」等の自然な番組名
    for (const ep of feed.episodes.slice(0, limit)) {
      // ラベル=PODCAST(kind由来)。タイトルは『』内に(末尾の！等の強調記号だけ落とす、？は残す)。
      // compact(Home)は厳しめに切って「…」で省略、通常(/updates)は全文。
      const title = ep.title.replace(/[！!\s　]+$/, '')
      rows.push({
        date: ep.date,
        kind: 'Podcast',
        excerpt: `${showName}『${compact ? clip(title, HOME_TITLE_MAX) : title}』`,
        href: `/podcast/${s.slug}/${ep.id}`,
      })
    }
  })

  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  // 当日ライブ行は「今この瞬間」なので、同日の他更新より上=最上部に固定する
  rows.sort((a, b) => (a.live === b.live ? 0 : a.live ? -1 : 1))
  return rows.slice(0, limit)
}
