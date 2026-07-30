import type { Metadata } from 'next'
import { createService } from '@/lib/supabase/service'
import { todayInTokyo } from '@/lib/scribe/date'
import LiveFull from './LiveFull'
import { isRecentlyWritten } from '@/lib/site/serverBody'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'desk — live' }

// 当日ライブ全文ページ(/watch後継)。Homeの窓の「全文を読む →」の遷移先。
// 日が終われば同じ内容は確定アーカイブ(/scribe/[date])になる。
export default async function LivePage() {
  const today = todayInTokyo()
  const service = createService()
  const { data } = await service
    .from('scribe_days')
    .select('html, updated_at')
    .eq('date', today)
    .maybeSingle()

  const recentlyWritten = isRecentlyWritten(data?.updated_at as string | null)

  return (
    <div className="measure">
      <LiveFull
        relay={process.env.SCRIBE_RELAY_URL ?? null}
        recentlyWritten={recentlyWritten}
        today={today}
        initialHtml={data?.html || null}
      />
    </div>
  )
}
