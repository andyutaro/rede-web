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
  kind: 'scribe' | 'Article' | 'Photography' | 'Physical' | 'Podcast' | 'News'
  label?: string // ラベル列の表示を上書き(Podcast=番組名など)
  excerpt?: string // タイトル列
  href: string // 空文字=リンクなし(手動投稿でリンク先を持たない行)
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

  // '*': deleted_at列がマイグレーション未実行でも壊れない読み方。
  // ゴミ箱(studio)入りの日はUpdatesにも出さない
  const { data: days } = await service
    .from('scribe_days')
    .select('*')
    .not('finalized_at', 'is', null)
    .order('date', { ascending: false })
    .limit(limit + 10) // ゴミ箱分を除いてもlimit件を保てるよう余分に取る
  const liveDays = (days ?? []).filter((d) => !d.deleted_at).slice(0, limit)

  const rows: UpdateRow[] = liveDays.map((d) => ({
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
      // ラベル=棚名: Notesの記事はNOTES+ARTICLE『…』、
      // Photography/Physicalは独立棚なので棚名+『…』
      const title = ((a.title as string) ?? '').trim() || '無題'
      const clipped = compact ? clip(title, HOME_TITLE_MAX) : title
      const type = a.type as string
      const row =
        type === 'photography'
          ? { kind: 'Photography' as const, label: 'PHOTOGRAPHY', excerpt: `『${clipped}』`, href: `/photography/${a.id}` }
          : type === 'physical'
            ? { kind: 'Physical' as const, label: 'PHYSICAL', excerpt: `『${clipped}』`, href: `/physical/${a.id}` }
            : { kind: 'Article' as const, label: 'NOTES', excerpt: `ARTICLE『${clipped}』`, href: `/notes/${a.id}` }
      rows.push({
        date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(
          new Date(a.published_at as string)
        ),
        ...row,
      })
    }
  }

  // 手動投稿(studioのUPDATES室)。テーブル未作成ならerrorで空のまま。
  // ゴミ箱入りは出さない。リンク先が無い行はhref=''(表示側で非リンク)
  const { data: manual, error: manualErr } = await service
    .from('manual_updates')
    .select('*')
    .order('date', { ascending: false })
    .limit(limit + 10)
  if (!manualErr) {
    for (const m of manual ?? []) {
      if (m.deleted_at) continue
      const text = (m.body as string) ?? ''
      rows.push({
        date: m.date as string,
        kind: 'News',
        label: ((m.label as string) || 'NEWS').toUpperCase(),
        excerpt: compact ? clip(text, HOME_TITLE_MAX) : text,
        href: (m.href as string | null) ?? '',
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
