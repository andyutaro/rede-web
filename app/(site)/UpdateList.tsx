import Link from 'next/link'
import type { UpdateRow } from '@/lib/site/updates'
import { dateDots } from '@/lib/site/text'

export default function UpdateList({ rows }: { rows: UpdateRow[] }) {
  return (
    <div>
      {rows.map((row) => (
        <div className="update-row" key={`${row.kind}-${row.date}-${row.href}`}>
          <Link href={row.href}>
            <span className="update-date">{dateDots(row.date)}</span>
            <span className="update-kind">{row.kind.toUpperCase()}</span>
            {row.excerpt && <span className="update-excerpt">{row.excerpt}</span>}
          </Link>
        </div>
      ))}
    </div>
  )
}
