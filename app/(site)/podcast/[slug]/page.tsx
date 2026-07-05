import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { showBySlug } from '@/lib/site/shows'
import { fetchShowFeed } from '@/lib/site/podcastFeed'
import { dateDots } from '@/lib/site/text'
import PlatformLinks from '../PlatformLinks'

export const dynamic = 'force-dynamic'

type Params = { slug: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const show = showBySlug(slug)
  return { title: show?.name ?? 'Podcast' }
}

// 番組ページ: カバー・番組名・RSSのchannel説明・ROLE(担当領域、旧サイト移植)・
// エピソード索引(rebuild.fm参照: 逆時系列の行、タイトル+日付)。
export default async function ShowPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const show = showBySlug(slug)
  if (!show || !show.feed) notFound()

  const feed = await fetchShowFeed(show.feed, show.since)

  return (
    <div className="measure">
      <section className="section show-header">
        {feed?.image && (
          <div className="sq cover-frame show-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={feed.image} alt={show.name} />
          </div>
        )}
        <h1 className="show-title">{feed?.title || show.name}</h1>
        {/* channel説明はプレーンテキスト(改行保持)。外部由来なのでテキストとして描画 */}
        {feed?.description && <p className="show-description">{feed.description}</p>}
        {/* 配信先(番組単位)。設定された分だけ */}
        <PlatformLinks platforms={show.platforms} />
      </section>

      {/* ROLE: 番組カタログがポートフォリオを兼ねる(旧サイト移植)。文言未設定なら出さない */}
      {show.role && (
        <section className="section">
          <div className="section-head">
            <span>ROLE</span>
          </div>
          <p className="show-role">{show.role}</p>
        </section>
      )}

      {feed && feed.episodes.length > 0 && (
        <section className="section">
          <div className="section-head">
            <span>EPISODES — {feed.episodes.length}</span>
          </div>
          <div className="section-body">
            {feed.episodes.map((ep) => (
              <div className="update-row" key={ep.id}>
                <Link href={`/podcast/${show.slug}/${ep.id}`}>
                  <span className="update-date">{dateDots(ep.date)}</span>
                  <span className="update-excerpt">{ep.title}</span>
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
