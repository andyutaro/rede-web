import type { Metadata } from 'next'
import { SHOWS } from '@/lib/site/shows'
import { fetchShowFeed } from '@/lib/site/podcastFeed'
import { tokyoDaysAgo } from '@/lib/site/text'
import CoverGrid from '../CoverGrid'
import PodcastEpisodeGrid, { type EpItem } from './PodcastEpisodeGrid'

export const revalidate = 1800

export const metadata: Metadata = { title: 'Podcast' }

export default async function PodcastPage() {
  const feeds = await Promise.all(
    SHOWS.map((s) => (s.feed ? fetchShowFeed(s.feed, s.since) : Promise.resolve(null)))
  )

  const withArt = SHOWS.map((s, i) => ({
    ...s,
    cover: feeds[i]?.image ?? null,
    latest: feeds[i]?.latest ?? null,
  }))
    .filter((s): s is typeof s & { cover: string } => Boolean(s.cover))
    .sort((a, b) => (b.latest ?? '').localeCompare(a.latest ?? ''))

  const allEpisodes: EpItem[] = []
  SHOWS.forEach((show, i) => {
    const feed = feeds[i]
    if (!feed) return
    for (const ep of feed.episodes) {
      allEpisodes.push({
        key: `${show.slug}-${ep.id}`,
        slug: show.slug,
        epId: ep.id,
        title: ep.title,
        date: ep.date,
        thumb: ep.image ?? feed.image,
        showLabel: show.display ?? show.name,
        group: show.group,
      })
    }
  })
  allEpisodes.sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="measure">
      <CoverGrid heading="ORIGINAL" shows={withArt.filter((s) => s.group === 'original')} />
      <CoverGrid heading="WORKS" shows={withArt.filter((s) => s.group === 'works')} />
      <PodcastEpisodeGrid
        episodes={allEpisodes}
        total={allEpisodes.length}
        newSince={tokyoDaysAgo(7)}
      />
    </div>
  )
}
