import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SHOWS, showBySlug } from '@/lib/site/shows'
import { fetchShowFeed } from '@/lib/site/podcastFeed'
import { dateDots } from '@/lib/site/text'
import Accordion from '../../about/Accordion'
import PlatformLinks from '../PlatformLinks'

// ISR: 30分ごとに再検証し、新エピソードを自動で番組ページに反映する
export const revalidate = 1800

// 番組は5枠で既知なのでビルド時にプリレンダー(feedのある番組のみ)。
// 各ページは30分ごとに背景で再生成され、新エピソードが乗る。
export function generateStaticParams() {
  return SHOWS.filter((s) => s.feed).map((s) => ({ slug: s.slug }))
}

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
        {/* 初見者が「本人の番組か制作参加か」を判別できる棚見出し(2026-07-14 Andy指摘)。
            語彙はHomeの棚(PODCAST — ORIGINAL/WORKS)と同一=サイト内で意味が通る */}
        <div className="section-head show-shelf-head">
          <span>PODCAST — {show.group === 'original' ? 'ORIGINAL' : 'WORKS'}</span>
        </div>
        {feed?.image && (
          <div className="sq cover-frame show-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={feed.image} alt={show.name} />
          </div>
        )}
        <h1 className="show-title">{feed?.title || show.name}</h1>
        {/* 所属の一行(初見への直接回答)。詳細な担当領域はROLE欄 */}
        <p className="show-affiliation">
          {show.group === 'original' ? 'Andyのオリジナル番組' : 'Andyが制作参加する番組'}
        </p>
        {/* 配信先(番組単位)。設定された分だけ */}
        <PlatformLinks platforms={show.platforms} />
        {/* ショーノート(channel説明)は長いのでアコーディオン格納(2026-07-10、デフォルト閉)。
            プレーンテキスト(改行保持)。外部由来なのでテキストとして描画 */}
        {feed?.description && (
          <div className="podcast-fold">
            <Accordion label="SHOW NOTES">
              <p className="show-description">{feed.description}</p>
            </Accordion>
          </div>
        )}
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
