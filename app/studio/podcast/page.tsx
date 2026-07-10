import { createClient } from '@/lib/supabase/server'
import { SHOWS } from '@/lib/site/shows'
import { fetchShowFeed } from '@/lib/site/podcastFeed'
import PodcastInbox, { type InboxRow } from './PodcastInbox'

export const dynamic = 'force-dynamic'

// Podcast Inbox: RSS取り込み済みエピソードのうち未タグのものが溜まる場所。
// Andyが任意のタイミングでタグ付けする(仕様: 取り込み後は「未タグのエピソード」に溜まる)。
export default async function StudioPodcast() {
  const supabase = await createClient()

  const [feeds, { data: tagRows }] = await Promise.all([
    Promise.all(SHOWS.map((s) => (s.feed ? fetchShowFeed(s.feed, s.since) : Promise.resolve(null)))),
    supabase.from('episode_tags').select('show_slug, episode_id, tags'),
  ])

  const tagMap = new Map<string, string[]>()
  for (const r of tagRows ?? []) {
    tagMap.set(`${r.show_slug}/${r.episode_id}`, (r.tags as string[]) ?? [])
  }

  const rows: InboxRow[] = []
  SHOWS.forEach((show, i) => {
    const feed = feeds[i]
    if (!feed) return
    for (const ep of feed.episodes) {
      rows.push({
        showSlug: show.slug,
        showLabel: show.display ?? show.name,
        episodeId: ep.id,
        title: ep.title,
        date: ep.date,
        tags: tagMap.get(`${show.slug}/${ep.id}`) ?? [],
      })
    }
  })
  rows.sort((a, b) => b.date.localeCompare(a.date))

  return (
    <>
      <h1 className="studio-h1">PODCAST INBOX</h1>
      <PodcastInbox rows={rows} />
    </>
  )
}
