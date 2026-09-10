import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { SHOWS } from '@/lib/site/shows'
import { fetchShowFeed } from '@/lib/site/podcastFeed'
import { getTagVocabulary } from '@/lib/studio/tagVocabulary'
import { listGuestEpisodes } from '@/lib/site/guestEpisodes'
import PodcastInbox, { type InboxRow } from './PodcastInbox'
import GuestManager, { type GuestListRow } from './GuestManager'

export const dynamic = 'force-dynamic'

// 部屋は増やさずタブにする(2026-09-10。NOTES室と同じ作法=上部メニューを増やさない)
const TABS = [
  { key: 'inbox', label: 'INBOX' },
  { key: 'guest', label: 'GUEST' },
] as const
type TabKey = (typeof TABS)[number]['key']

// Podcast Inbox: RSS取り込み済みエピソードのうち未タグのものが溜まる場所。
// Andyが任意のタイミングでタグ付けする(仕様: 取り込み後は「未タグのエピソード」に溜まる)。
export default async function StudioPodcast({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab: rawTab } = await searchParams
  const tab: TabKey = (TABS.find((t) => t.key === rawTab)?.key ?? 'inbox') as TabKey

  const tabs = (
    <div className="studio-tabs">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.key === 'inbox' ? '/studio/podcast' : `/studio/podcast?tab=${t.key}`}
          aria-current={tab === t.key ? 'page' : undefined}
        >
          {t.label}
        </Link>
      ))}
    </div>
  )

  // ゲスト出演(2026-09-10): 他番組に出た回をSpotify URLの貼り付けで登録する
  if (tab === 'guest') {
    const eps = await listGuestEpisodes()
    const rows: GuestListRow[] = eps.map((e) => ({
      id: e.id,
      showName: e.showName,
      title: e.title,
      date: e.date,
      duration: e.duration,
      hasAudio: Boolean(e.audioUrl),
    }))
    return (
      <>
        <h1 className="studio-h1">PODCAST — GUEST</h1>
        {tabs}
        <GuestManager rows={rows} />
      </>
    )
  }

  const supabase = await createClient()

  const [feeds, { data: tagRows }, tagVocabulary] = await Promise.all([
    Promise.all(SHOWS.map((s) => (s.feed ? fetchShowFeed(s.feed, s.since) : Promise.resolve(null)))),
    // hidden列はマイグレーション後に存在する。'*'なら未実行でも壊れない
    supabase.from('episode_tags').select('*'),
    getTagVocabulary(supabase),
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

  // 入門トグルの対象(2026-07-23 Andy: オリジナル・仕事番組を問わず全番組)。
  // 順はSHOWSの並びに従う=上部の本数表示が毎回同じ順で出る
  const starterSlugs = SHOWS.filter((s) => s.feed).map((s) => s.slug)

  return (
    <>
      <h1 className="studio-h1">PODCAST INBOX</h1>
      {tabs}
      <PodcastInbox rows={rows} tagVocabulary={tagVocabulary} starterSlugs={starterSlugs} />
    </>
  )
}
