import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createService } from '@/lib/supabase/service'
import { todayInTokyo } from '@/lib/scribe/date'
import { firstImageSrc, plainExcerpt, scribeTitle } from '@/lib/site/text'
import { breadcrumbJsonLd } from '@/lib/site/breadcrumbs'
import { ogpImage } from '@/lib/site/ogp'
import Pager from '../../Pager'
import ScribeArchive from '../ScribeArchive'
import SamePeriod from '../../SamePeriod'
import { loadAnnotations } from '@/lib/site/annotations'
import { isEditor } from '@/lib/supabase/editor'

export const dynamic = 'force-dynamic'

// scribeをArticle配下に格納する設計意図の担保(handoff-notes §11):
// 各アーカイブ冒頭に「scribeとは何か」の位置づけ文をテンプレート焼き込みで置く。
// 文言はAndyの承認待ち(仮置き)。
// 全幅に流すと「横にだらっと広がる」ため、行を設計して短い銘文として組む
// (2026-07-19 Andy指摘)。改行は意味の切れ目で固定
const PREAMBLE_LINES = [
  'desk — 読むポッドキャスト。',
  '日々の考え事やつぶやきを生放送で書き、一日が終わると確定テキストになります。',
  'これはそのアーカイブ。',
]

type Params = { date: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { date } = await params
  // 確定scribeのタイトル規則(2026-07-10): 「Scribe Archive + 日付導出タイトル」
  const title = `Desk Archive ${scribeTitle(date)}`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { title }
  // SNSカードにその日のサムネイルを出す(2026-07-23)。
  // 公開されない日(未確定・ゴミ箱)はページ本体がnotFound()するので、
  // ここでも同じ条件で弾く(でないと非公開の日の画像がmetaタグに漏れる)。
  const service = createService()
  const { data } = await service
    .from('scribe_days')
    .select('html, thumbnail_url, thumbnail_source, finalized_at, deleted_at')
    .eq('date', date)
    .maybeSingle()
  if (!data || !data.html || data.deleted_at || !data.finalized_at) return { title }
  // 優先順位は一覧(app/(site)/notes/page.tsx)の正典に合わせる:
  // manual > 本文の最初の画像 > 充当(焼き込み)。thumbnail_urlを無条件に優先すると、
  // 充当の借り物写真が後から入った本文写真より優先されてカードだけ食い違う
  const first = firstImageSrc((data.html as string) ?? '')
  const stored = data.thumbnail_url as string | null
  const thumb = data.thumbnail_source === 'manual' && stored ? stored : (first ?? stored)
  return {
    ...ogpImage(title, thumb, { large: true }),
    // description: その日の書き出し(Andy自身の言葉)から抜粋(2026-07-25)
    description: plainExcerpt(data.html as string) || undefined,
    alternates: { canonical: `https://andyutaro.com/scribe/${date}` },
  }
}

export default async function ScribeDayPage({ params }: { params: Promise<Params> }) {
  const { date } = await params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound()

  const service = createService()
  // '*': deleted_at列がマイグレーション未実行でも壊れない読み方
  const { data } = await service.from('scribe_days').select('*').eq('date', date).maybeSingle()

  if (!data || !data.html || data.deleted_at) notFound()

  // 当日まだ確定していない分は生放送ページへ(アーカイブとして固定表示しない)
  if (!data.finalized_at) {
    if (date === todayInTokyo()) redirect('/live')
    notFound()
  }

  // 戻る・進む: 前後の確定日(確定済みかつゴミ箱でない日だけを渡り歩く)
  const [prevRes, nextRes] = await Promise.all([
    service
      .from('scribe_days')
      .select('date')
      .not('finalized_at', 'is', null)
      .is('deleted_at', null)
      .lt('date', date)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from('scribe_days')
      .select('date')
      .not('finalized_at', 'is', null)
      .is('deleted_at', null)
      .gt('date', date)
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
  const pagerLink = (d?: string | null) =>
    d ? { href: `/desk/${d}`, title: `Desk Archive ${scribeTitle(d)}` } : null

  // いちばん新しい確定アーカイブの「次」は、まだ確定していない今日のdesk(2026-08-01
  // Andy指定)。ここが空欄だと、前日まで遡って読んだ人が今日へ戻る道を失う。
  // 次の確定日がある回では従来どおりそちらが「次」
  const today = todayInTokyo()
  const newerLink =
    pagerLink(nextRes.data?.date as string) ??
    (date < today ? { href: '/live', title: `Desk Live ${scribeTitle(today)}` } : null)

  // 注釈(2026-07-28): 本文とは別レイヤー。ログイン中なら自分のサイトを普通に
  // 見ている画面から、ドラッグして直接足せる(書き込みの可否はAPI側で再検証する)
  const [annotations, canEdit] = await Promise.all([
    loadAnnotations({ kind: 'scribe', key: date }),
    isEditor(),
  ])

  return (
    <div className="measure">
      {/* パンくず(2026-07-25): scribeの棚はNotes */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: breadcrumbJsonLd([
            { name: 'Home', path: '' },
            { name: 'Notes', path: '/notes' },
            { name: `Desk Archive ${scribeTitle(date)}`, path: `/desk/${date}` },
          ]),
        }}
      />
      <article className="section">
        {/* scribeのタイトルは日付導出(20260706)。日付はdatetimeとして併記 */}
        <div className="section-head">
          <h1>DESK ARCHIVE — {scribeTitle(date)}</h1>
        </div>
        <p className="scribe-preamble">
          {PREAMBLE_LINES.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
        <ScribeArchive
          html={data.html as string}
          annotations={annotations}
          canEdit={canEdit}
          target={{ kind: 'scribe', key: date }}
        />
        {/* 同じ頃(2026-07-28): この日の前後7日に生まれた他の仕事。
            scribe同士の行き来はPagerの担当なので/scribe/は除く */}
        <SamePeriod date={date} excludePrefix="/desk/" />
        <Pager
          older={pagerLink(prevRes.data?.date as string)}
          newer={newerLink}
          back={{ href: '/notes', title: 'NOTES' }}
        />
      </article>
    </div>
  )
}
