import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createService } from '@/lib/supabase/service'
import { todayInTokyo } from '@/lib/scribe/date'
import { firstImageSrc, scribeTitle } from '@/lib/site/text'
import { ogpImage } from '@/lib/site/ogp'
import Pager from '../../Pager'
import ScribeArchive from '../ScribeArchive'

export const dynamic = 'force-dynamic'

// scribeをArticle配下に格納する設計意図の担保(handoff-notes §11):
// 各アーカイブ冒頭に「scribeとは何か」の位置づけ文をテンプレート焼き込みで置く。
// 文言はAndyの承認待ち(仮置き)。
// 全幅に流すと「横にだらっと広がる」ため、行を設計して短い銘文として組む
// (2026-07-19 Andy指摘)。改行は意味の切れ目で固定
const PREAMBLE_LINES = [
  'scribe — 読むポッドキャスト。',
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
  const title = `Scribe Archive ${scribeTitle(date)}`
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
  return ogpImage(title, thumb, { large: true })
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
    d ? { href: `/scribe/${d}`, title: `Scribe Archive ${scribeTitle(d)}` } : null

  return (
    <div className="measure">
      <article className="section">
        {/* scribeのタイトルは日付導出(20260706)。日付はdatetimeとして併記 */}
        <div className="section-head">
          <h1>SCRIBE ARCHIVE — {scribeTitle(date)}</h1>
        </div>
        <p className="scribe-preamble">
          {PREAMBLE_LINES.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </p>
        <ScribeArchive html={data.html as string} />
        <Pager
          older={pagerLink(prevRes.data?.date as string)}
          newer={pagerLink(nextRes.data?.date as string)}
          back={{ href: '/notes', title: 'NOTES' }}
        />
      </article>
    </div>
  )
}
