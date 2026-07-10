import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createService } from '@/lib/supabase/service'
import { todayInTokyo } from '@/lib/scribe/date'
import { scribeTitle } from '@/lib/site/text'
import Pager from '../../Pager'
import ScribeArchive from '../ScribeArchive'

export const dynamic = 'force-dynamic'

// scribeをArticle配下に格納する設計意図の担保(handoff-notes §11):
// 各アーカイブ冒頭に「scribeとは何か」の位置づけ文をテンプレート焼き込みで置く。
// 文言はAndyの承認待ち(仮置き)。
const PREAMBLE =
  'scribe — 読むポッドキャスト。日々の考え事やつぶやきを生放送で書き、一日が終わると確定テキストになります。これはそのアーカイブ。'

type Params = { date: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { date } = await params
  // 確定scribeのタイトル規則(2026-07-10): 「Scribe Archive + 日付導出タイトル」
  return { title: `Scribe Archive ${scribeTitle(date)}` }
}

export default async function ScribeDayPage({ params }: { params: Promise<Params> }) {
  const { date } = await params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound()

  const service = createService()
  const { data } = await service
    .from('scribe_days')
    .select('date, html, finalized_at')
    .eq('date', date)
    .maybeSingle()

  if (!data || !data.html) notFound()

  // 当日まだ確定していない分は生放送ページへ(アーカイブとして固定表示しない)
  if (!data.finalized_at) {
    if (date === todayInTokyo()) redirect('/live')
    notFound()
  }

  // 戻る・進む: 前後の確定日(確定済みだけを渡り歩く)
  const [prevRes, nextRes] = await Promise.all([
    service
      .from('scribe_days')
      .select('date')
      .not('finalized_at', 'is', null)
      .lt('date', date)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from('scribe_days')
      .select('date')
      .not('finalized_at', 'is', null)
      .gt('date', date)
      .order('date', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])
  const pagerLink = (d?: string | null) =>
    d ? { href: `/scribe/${d}`, title: `Scribe Archive ${scribeTitle(d)}` } : null

  return (
    <div className="measure">
      <article className="section">
        {/* scribeのタイトルは日付導出(20260706)。日付はdatetimeとして併記 */}
        <div className="section-head">
          <span>SCRIBE ARCHIVE — {scribeTitle(date)}</span>
        </div>
        <p className="scribe-preamble">{PREAMBLE}</p>
        <ScribeArchive html={data.html as string} />
        <Pager older={pagerLink(prevRes.data?.date as string)} newer={pagerLink(nextRes.data?.date as string)} />
      </article>
    </div>
  )
}
