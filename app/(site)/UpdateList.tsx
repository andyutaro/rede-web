import Link from 'next/link'
import type { UpdateRow } from '@/lib/site/updates'
import { dateDotsParts } from '@/lib/site/text'

export default function UpdateList({ rows }: { rows: UpdateRow[] }) {
  return (
    <div>
      {rows.map((row) => {
        // 年はスマホでのみ畳む(今年の行だけ)。表記そのものは従来と同じ「2026.07.31」
        const d = dateDotsParts(row.date)
        const cells = (
          <>
            <span className="update-date">
              <span className={d.thisYear ? 'ud-year' : undefined}>{d.year}</span>
              {d.rest}
            </span>
            <span className="update-kind">{row.label ?? row.kind.toUpperCase()}</span>
            {row.excerpt && <span className="update-excerpt">{row.excerpt}</span>}
            {row.live && <span className="update-live-dot" aria-label="LIVE" />}
          </>
        )
        return (
          <div className="update-row" key={`${row.kind}-${row.date}-${row.href}-${row.excerpt}`}>
            {/* 手動投稿はリンク先を持たないことがある(href='') */}
            {row.href ? <Link href={row.href}>{cells}</Link> : <span className="update-nolink">{cells}</span>}
          </div>
        )
      })}
    </div>
  )
}
