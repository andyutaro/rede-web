import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { showBySlug } from '@/lib/site/shows'
import { fetchShowFeed } from '@/lib/site/podcastFeed'
import { dateDots } from '@/lib/site/text'
import EpisodeNotes from '../../EpisodeNotes'

export const dynamic = 'force-dynamic'

type Params = { slug: string; episode: string }

async function loadEpisode(params: Promise<Params>) {
  const { slug, episode } = await params
  const show = showBySlug(slug)
  if (!show || !show.feed) return null
  const feed = await fetchShowFeed(show.feed)
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

// エピソードページ: タイトル・サムネイル・遷移ボタン・概要欄の薄いテンプレート。
// サイト内プレイヤーは持たない。外部リスニングプラットフォームへ送客する。
export default async function EpisodePage({ params }: { params: Promise<Params> }) {
  const data = await loadEpisode(params)
  if (!data) notFound()
  const { show, feed, ep } = data

  const thumb = ep.image ?? feed.image

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
          {ep.link && (
            <div className="episode-listen">
              <a href={ep.link} target="_blank" rel="noopener noreferrer" className="listen-btn">
                エピソードを聴く →
              </a>
              {/* 旧サイトから移植の一文(LISTEN 3連説明は畳む) */}
              <p className="listen-note">全て無料です。使いやすいアプリからお聴きください。</p>
            </div>
          )}
        </div>
        {ep.description && <EpisodeNotes html={ep.description} />}
      </article>
    </div>
  )
}
