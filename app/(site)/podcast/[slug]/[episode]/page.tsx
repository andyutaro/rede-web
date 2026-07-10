import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { showBySlug } from '@/lib/site/shows'
import { fetchShowFeed } from '@/lib/site/podcastFeed'
import { dateDots } from '@/lib/site/text'
import Accordion from '../../../about/Accordion'
import Pager from '../../../Pager'
import EpisodeNotes from '../../EpisodeNotes'
import AudioPlayer from '../../AudioPlayer'
import PlatformLinks from '../../PlatformLinks'

// ISR: 30分ごとに再検証。新エピソードのページは初回アクセス時に生成・キャッシュされる
export const revalidate = 1800

type Params = { slug: string; episode: string }

async function loadEpisode(params: Promise<Params>) {
  const { slug, episode } = await params
  const show = showBySlug(slug)
  if (!show || !show.feed) return null
  const feed = await fetchShowFeed(show.feed, show.since)
  const ep = feed?.episodes.find((e) => e.id === episode)
  if (!ep) return null
  return { show, feed: feed!, ep }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const data = await loadEpisode(params)
  return { title: data ? data.ep.title : 'Podcast' }
}

// エピソードページ: タイトル・サムネイル・ネイティブ再生プレイヤー・
// 各配信先への送客ボタン・概要欄の薄いテンプレート。
export default async function EpisodePage({ params }: { params: Promise<Params> }) {
  const data = await loadEpisode(params)
  if (!data) notFound()
  const { show, feed, ep } = data

  const thumb = ep.image ?? feed.image

  // 戻る・進む: 同一番組内の前後エピソード(フィードは逆時系列なのでindex+1=古い方)
  const idx = feed.episodes.findIndex((e) => e.id === ep.id)
  const olderEp = feed.episodes[idx + 1]
  const newerEp = idx > 0 ? feed.episodes[idx - 1] : undefined
  const pagerLink = (e?: { id: string; title: string }) =>
    e ? { href: `/podcast/${show.slug}/${e.id}`, title: e.title } : null

  return (
    <div className="measure">
      <article className="section">
        <div className="section-head">
          <span>{(show.display ?? show.name).toUpperCase()} — {dateDots(ep.date)}</span>
        </div>
        <div className="episode-header">
          {thumb && (
            <div className="sq cover-frame episode-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumb} alt="" />
            </div>
          )}
          <h1 className="episode-title">{ep.title}</h1>
          {ep.duration && <div className="episode-duration">{ep.duration}</div>}

          {/* このエピソードをその場で聴くプレイヤー(enclosure) */}
          {ep.audioUrl && <AudioPlayer src={ep.audioUrl} title={ep.title} />}

          {/* 各配信先への送客(番組単位)。旧サイトの一文を添える */}
          {show.platforms && (
            <div className="episode-listen">
              <div className="listen-caption">配信先で聴く</div>
              <PlatformLinks platforms={show.platforms} />
              <p className="listen-note">全て無料です。使いやすいアプリからお聴きください。</p>
            </div>
          )}
        </div>
        {/* ショーノートとROLEはアコーディオン格納(2026-07-10、デフォルト閉)。
            タイトル・プレイヤー・配信先は畳まない(格納するのは長文だけ) */}
        {(ep.description || show.role) && (
          <div className="podcast-fold">
            {ep.description && (
              <Accordion label="SHOW NOTES">
                <EpisodeNotes html={ep.description} />
              </Accordion>
            )}
            {show.role && (
              <Accordion label="ROLE">
                <p className="show-role">{show.role}</p>
              </Accordion>
            )}
          </div>
        )}
        <Pager older={pagerLink(olderEp)} newer={pagerLink(newerEp)} />
      </article>
    </div>
  )
}
