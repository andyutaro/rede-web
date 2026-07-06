import type { Metadata } from 'next'
import Link from 'next/link'
import { searchScribe } from '@/lib/site/search'
import { dateDots } from '@/lib/site/text'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Search' }

// scribeアーカイブの全文検索。フォーム(GET q)+結果一覧。書誌ページの温度で、
// 一致箇所は無彩色ハイライト(サイトの彩色はLIVE赤のみの原則)。各件は個別へ。
export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const q = (await searchParams).q?.trim() ?? ''
  const hits = q ? await searchScribe(q) : []

  return (
    <div className="measure search">
      <section className="section">
        <div className="section-head">
          <span>SEARCH — SCRIBE</span>
        </div>
        <div className="section-body">
          <form className="search-form" action="/search" method="get">
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="アーカイブを検索"
              aria-label="アーカイブを検索"
              autoFocus
            />
            <button type="submit">検索</button>
          </form>

          {q && (
            <div className="search-count">
              「{q}」— {hits.length}件
            </div>
          )}

          <div className="search-results">
            {hits.map((h, i) => (
              <Link className="search-hit" href={`/scribe/${h.date}`} key={`${h.date}-${i}`}>
                <span className="search-date">{dateDots(h.date)}</span>
                <span className="search-snippet">
                  {h.before}
                  <mark>{h.match}</mark>
                  {h.after}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
