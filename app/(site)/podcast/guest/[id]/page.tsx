import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getGuestEpisode } from '@/lib/site/guestEpisodes'
import { dateDots, plainExcerpt } from '@/lib/site/text'
import { breadcrumbJsonLd } from '@/lib/site/breadcrumbs'
import Accordion from '../../../about/Accordion'
import Pager from '../../../Pager'
import SamePeriod from '../../../SamePeriod'
import EpisodeNotes from '../../EpisodeNotes'
import AudioPlayer from '../../AudioPlayer'
import PlatformLinks from '../../PlatformLinks'
import { imgThumb, IMG_W } from '@/lib/site/img'

// ゲスト出演の回(2026-09-10 Andy指定)。他番組に出た回を**サイト内で鳴らす**。
// 器は自分の番組のエピソードページと同じ(識別部→カバー→題名→プレイヤー→
// 送客→ショーノート→同じ頃→Pager)。違うのは:
//  ・所属バッジが GUEST — 出演
//  ・送客先は番組単位ではなくその回のSpotify URL
//  ・便り/ROLE/まとめ聞きは出さない(先方の番組なので、こちらの導線は置かない)
// 音源はRSSのenclosure=先方の配信元から流れる(普通のポッドキャストアプリと同じ)。

// 1日(2026-09-06)。理由は app/(site)/about/page.tsx の注記
export const revalidate = 86400

type Params = { id: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { id } = await params
  const g = await getGuestEpisode(id)
  if (!g) return { title: 'Podcast' }
  return {
    title: g.title,
    description: g.description ? plainExcerpt(g.description, 120) : undefined,
    alternates: { canonical: `https://andyutaro.com/podcast/guest/${g.id}` },
    ...(g.image
      ? {
          openGraph: {
            title: `${g.showName}『${g.title}』`,
            images: [{ url: g.image, alt: `${g.showName}『${g.title}』` }],
          },
        }
      : {}),
  }
}

export default async function GuestEpisodePage({ params }: { params: Promise<Params> }) {
  const { id } = await params
  const g = await getGuestEpisode(id)
  if (!g) notFound()

  const plain = g.description ? plainExcerpt(g.description, 200) : ''

  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'PodcastEpisode',
    name: g.title,
    url: `https://andyutaro.com/podcast/guest/${g.id}`,
    datePublished: g.date,
    ...(plain ? { description: plain } : {}),
    ...(g.image ? { image: g.image } : {}),
    ...(g.audioUrl
      ? { associatedMedia: { '@type': 'MediaObject', contentUrl: g.audioUrl } }
      : {}),
    partOfSeries: { '@type': 'PodcastSeries', name: g.showName },
  }).replace(/</g, '\\u003c')

  const crumbs = breadcrumbJsonLd([
    { name: 'Home', path: '' },
    { name: 'Podcast', path: '/podcast' },
    { name: g.title, path: `/podcast/guest/${g.id}` },
  ])

  return (
    <div className="measure">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: crumbs }} />
      <article className="section">
        <div className="section-head">
          <h2>
            {g.showName.toUpperCase()} — {dateDots(g.date)}
          </h2>
          <span className="head-affiliation">GUEST — 出演</span>
        </div>
        <div className="episode-header">
          {g.image && (
            <div className="sq cover-frame episode-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgThumb(g.image, IMG_W.tile)} alt="" decoding="async" />
            </div>
          )}
          <h1 className="episode-title">{g.title}</h1>
          {g.duration && !g.audioUrl && <div className="episode-duration">{g.duration}</div>}

          {g.audioUrl && <AudioPlayer src={g.audioUrl} title={g.title} />}

          {/* 送客はこの回のSpotify URLへ(番組単位ではない)。RSSを直接貼って
              登録した回はspotifyUrlを持たないので、その場合は出さない */}
          {g.spotifyUrl && (
            <div className="episode-listen">
              <div className="listen-caption">配信先で聴く</div>
              <PlatformLinks platforms={{ spotify: g.spotifyUrl }} />
              <p className="listen-note">全て無料です。使いやすいアプリからお聴きください。</p>
            </div>
          )}
        </div>

        {g.description && (
          <div className="podcast-fold">
            <Accordion label="SHOW NOTES">
              <EpisodeNotes html={g.description} />
            </Accordion>
          </div>
        )}

        <SamePeriod date={g.date} excludePrefix={`/podcast/guest/${g.id}`} />

        <Pager older={null} newer={null} back={{ href: '/podcast', title: 'Podcast' }} />
      </article>
    </div>
  )
}
