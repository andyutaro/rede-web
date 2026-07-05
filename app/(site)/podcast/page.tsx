import type { Metadata } from 'next'
import { SHOWS } from '@/lib/site/shows'
import { channelInfo } from '@/lib/site/podcastFeed'
import CoverGrid from '../CoverGrid'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Podcast' }

// Podcast棚: ORIGINAL/WORKSの2群(杉本のARTWORKS/SITE SPECIFICと同じ種別区分)。
// カバーで識別し、各カバーは番組ページへ。データはすべてRSSから。
export default async function PodcastPage() {
  const covers = await Promise.all(
    SHOWS.map((s) => (s.feed ? channelInfo(s.feed) : Promise.resolve({ image: null, latest: null })))
  )

  const withArt = SHOWS.map((s, i) => ({
    ...s,
    cover: covers[i].image,
    latest: covers[i].latest,
  }))
    .filter((s): s is typeof s & { cover: string } => Boolean(s.cover))
    .sort((a, b) => (b.latest ?? '').localeCompare(a.latest ?? ''))

  return (
    <div className="measure">
      <CoverGrid heading="ORIGINAL" shows={withArt.filter((s) => s.group === 'original')} />
      <CoverGrid heading="WORKS" shows={withArt.filter((s) => s.group === 'works')} />
    </div>
  )
}
