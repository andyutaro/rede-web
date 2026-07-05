import type { Metadata } from 'next'
import { recentUpdates } from '@/lib/site/updates'
import UpdateList from '../UpdateList'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Updates' }

// 全更新履歴。100件を超えたら月別グルーピングを入れる(それまでは素の一覧)
export default async function UpdatesPage() {
  const rows = await recentUpdates(100)
  return (
    <div className="measure">
      <section className="section">
        <div className="section-head">
          <span>UPDATES</span>
        </div>
        <div className="section-body">
          <UpdateList rows={rows} />
        </div>
      </section>
    </div>
  )
}
