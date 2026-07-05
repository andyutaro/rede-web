import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createService } from '@/lib/supabase/service'
import { todayInTokyo } from '@/lib/scribe/date'
import { dateDots } from '@/lib/site/text'
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
  return { title: `scribe ${dateDots(date)}` }
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

  return (
    <div className="measure">
      <article className="section">
        <div className="section-head">
          <span>SCRIBE — {dateDots(date)}</span>
        </div>
        <p className="scribe-preamble">{PREAMBLE}</p>
        <ScribeArchive html={data.html as string} />
      </article>
    </div>
  )
}
