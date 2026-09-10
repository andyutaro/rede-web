import type { Metadata } from 'next'
import { SHOWS } from '@/lib/site/shows'
import { fetchShowFeedLight } from '@/lib/site/podcastFeed'
import { tokyoDaysAgo } from '@/lib/site/text'
import { listGuestEpisodes } from '@/lib/site/guestEpisodes'
import CoverGrid from '../CoverGrid'
import PodcastEpisodeGrid, { type EpItem } from './PodcastEpisodeGrid'

// 1日(2026-09-06)。理由は app/(site)/about/page.tsx の注記
export const revalidate = 86400

// 棚のdescription: 番組名はshows.tsから組む(番組が増えても追従、散文は書かない)
const showNames = (group: 'original' | 'works') =>
  SHOWS.filter((s) => s.group === group && s.feed)
    .map((s) => s.shortName ?? s.name)
    .join('、')

export const metadata: Metadata = {
  title: 'Podcast',
  description: `Andyのポッドキャスト番組一覧。オリジナル番組: ${showNames('original')}。制作参加: ${showNames('works')}。`,
  alternates: { canonical: 'https://andyutaro.com/podcast' },
}

export default async function PodcastPage() {
  // 棚はタイトル・日付・カバーだけ使う=軽量版で足りる
  const [feeds, guests] = await Promise.all([
    Promise.all(
      SHOWS.map((s) => (s.feed ? fetchShowFeedLight(s.feed, s.since) : Promise.resolve(null)))
    ),
    listGuestEpisodes(),
  ])

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
  // ゲスト出演(2026-09-10 Andy指定): 他番組に出た回。番組タイルには出さず
  // エピソードのタイルにだけ並ぶ。並びは自番組の回と同じ**公開日降順**
  // (「サイトに追加した日順」ではない)ので、下の共通ソートに素直に混ぜる
  for (const g of guests) {
    allEpisodes.push({
      key: `guest-${g.id}`,
      slug: 'guest',
      epId: g.id,
      href: `/podcast/guest/${g.id}`,
      title: g.title,
      date: g.date,
      thumb: g.image,
      showLabel: g.showName,
      group: 'guest',
    })
  }

  allEpisodes.sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="measure">
      <h1 className="sr-only">Podcast</h1>
      {/* 番組の更新は4日、下のエピソード新着は7日と窓が違う(2026-08-05)。
          番組タイルは「いま動いている番組」を短い窓で示す方が意味が立つ */}
      <CoverGrid
        heading="ORIGINAL"
        shows={withArt.filter((s) => s.group === 'original')}
        onAirSince={tokyoDaysAgo(4)}
      />
      <CoverGrid
        heading="WORKS"
        shows={withArt.filter((s) => s.group === 'works')}
        onAirSince={tokyoDaysAgo(4)}
      />
      <PodcastEpisodeGrid
        episodes={allEpisodes}
        total={allEpisodes.length}
        newSince={tokyoDaysAgo(7)}
      />
    </div>
  )
}
