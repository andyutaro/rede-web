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
    // hidden列はマイグレーション後に存在する。'*'なら未実行でも壊れない
    supabase.from('episode_tags').select('*'),
  ])

  const tagMap = new Map<string, { tags: string[]; hidden: boolean }>()
  for (const r of tagRows ?? []) {
    tagMap.set(`${r.show_slug}/${r.episode_id}`, {
      tags: (r.tags as string[]) ?? [],
      hidden: Boolean(r.hidden),
    })
  }

  const rows: InboxRow[] = []
  SHOWS.forEach((show, i) => {
    const feed = feeds[i]
    if (!feed) return
    for (const ep of feed.episodes) {
      const t = tagMap.get(`${show.slug}/${ep.id}`)
      rows.push({
        showSlug: show.slug,
        showLabel: show.display ?? show.name,
        episodeId: ep.id,
        title: ep.title,
        date: ep.date,
        tags: t?.tags ?? [],
        hidden: t?.hidden ?? false,
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
