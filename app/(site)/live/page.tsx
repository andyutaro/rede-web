import type { Metadata } from 'next'
import { createService } from '@/lib/supabase/service'
import { todayInTokyo } from '@/lib/scribe/date'
import { scribeTitle } from '@/lib/site/text'
import LiveFull from './LiveFull'
import Pager from '../Pager'
import CreatureRow from '../CreatureRow'
import { arrivalsOf } from '@/lib/site/arrivals'
import { isRecentlyWritten } from '@/lib/site/serverBody'
import { loadAnnotations } from '@/lib/site/annotations'
import { isEditor } from '@/lib/supabase/editor'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'desk — live' }

// 当日ライブ全文ページ(/watch後継)。Homeの窓の「全文を読む →」の遷移先。
// 日が終われば同じ内容は確定アーカイブ(/scribe/[date])になる。
export default async function LivePage() {
  const today = todayInTokyo()
  const service = createService()
  // 前日への行き先(2026-08-01 Andy指定)。確定済みかつゴミ箱でない日だけを渡り歩く
  // =確定アーカイブ側のPagerとまったく同じ条件にする(行き来が食い違わない)
  // 当日の本文にも注釈をつけられるようにする(2026-08-01 Andy指定)。
  // 宛先キーは確定アーカイブとまったく同じ(kind:'scribe', key:日付)。
  // 0:01に確定してアーカイブになった後も、同じ注釈がそのまま出る
  const [{ data }, prevRes, annotations, canEdit, arrivals] = await Promise.all([
    service.from('scribe_days').select('html, updated_at').eq('date', today).maybeSingle(),
    service
      .from('scribe_days')
      .select('date')
      .not('finalized_at', 'is', null)
      .is('deleted_at', null)
      .lt('date', today)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadAnnotations({ kind: 'scribe', key: today }),
    isEditor(),
    arrivalsOf(today),
  ])

  const recentlyWritten = isRecentlyWritten(data?.updated_at as string | null)
  const prev = prevRes.data?.date as string | undefined

  return (
    <div className="measure">
      <LiveFull
        relay={process.env.SCRIBE_RELAY_URL ?? null}
        recentlyWritten={recentlyWritten}
        today={today}
        initialHtml={data?.html || null}
        annotations={annotations}
        canEdit={canEdit}
        target={{ kind: 'scribe', key: today }}
      />
      {/* 今日ここに来た人の分だけ、波形に生えた線画が生えた順に並ぶ(2026-08-07 Andy指定)。
          遊びの意匠であって機能ではないので、数字も名前も出さない */}
      {arrivals.length > 0 && (
        <section className="section arrival-section">
          <div className="section-head">
            <h2>今日来てくれた人</h2>
          </div>
          <div className="section-body">
            <CreatureRow kinds={arrivals} />
          </div>
        </section>
      )}
      {/* 当日の画面にも前日と一覧への行き先を置く(2026-08-01 Andy指定)。
          「次」は無い: 今日が最新なので、進む先はまだ生まれていない */}
      <Pager
        older={prev ? { href: `/desk/${prev}`, title: `Desk Archive ${scribeTitle(prev)}` } : null}
        newer={null}
        back={{ href: '/notes', title: 'NOTES' }}
      />
    </div>
  )
}
