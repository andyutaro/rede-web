import type { Metadata } from 'next'
import { createService } from '@/lib/supabase/service'
import { todayInTokyo } from '@/lib/scribe/date'
import { scribeTitle } from '@/lib/site/text'
import LiveFull from './LiveFull'
import Pager from '../Pager'
import { isRecentlyWritten } from '@/lib/site/serverBody'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'desk — live' }

// 当日ライブ全文ページ(/watch後継)。Homeの窓の「全文を読む →」の遷移先。
// 日が終われば同じ内容は確定アーカイブ(/scribe/[date])になる。
export default async function LivePage() {
  const today = todayInTokyo()
  const service = createService()
  // 前日への行き先(2026-08-01 Andy指定)。確定済みかつゴミ箱でない日だけを渡り歩く
  // =確定アーカイブ側のPagerとまったく同じ条件にする(行き来が食い違わない)
  const [{ data }, prevRes] = await Promise.all([
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
      />
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
