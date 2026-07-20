import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SHOWS, showBySlug } from '@/lib/site/shows'
import { fetchShowFeed } from '@/lib/site/podcastFeed'
import { dateDots, dateShort, htmlToPlainText, tokyoDaysAgo } from '@/lib/site/text'
import { createService } from '@/lib/supabase/service'
import { imgThumb, IMG_W } from '@/lib/site/img'
import Accordion from '../../about/Accordion'
import PlatformLinks from '../PlatformLinks'
import EpisodeIndex, { type IndexRow } from '../EpisodeIndex'
import ShowPlayAll from '../ShowPlayAll'

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

// 入門3選(2026-07-20): studioのPODCAST INBOXで「入門」タグを付けた回。
// RSSには「推奨入口」という概念が無い=アプリに出来ない編集行為。ORIGINAL番組のみ
const STARTER_TAG = '入門'

async function starterIds(slug: string): Promise<Set<string>> {
  const service = createService()
  const { data } = await service
    .from('episode_tags')
    .select('episode_id, tags')
    .eq('show_slug', slug)
    .contains('tags', [STARTER_TAG])
  return new Set((data ?? []).map((r) => r.episode_id as string))
}

// 番組ページ: カバー・番組名・配信先・(ORIGINALのみ)入門3選・連続再生・
// SHOW NOTES・検索付きエピソード索引。
export default async function ShowPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const show = showBySlug(slug)
  if (!show || !show.feed) notFound()

  const isOriginal = show.group === 'original'
  const [feed, starters] = await Promise.all([
    fetchShowFeed(show.feed, show.since),
    isOriginal ? starterIds(slug) : Promise.resolve(new Set<string>()),
  ])

  const episodes = feed?.episodes ?? []
  const starterEps = episodes.filter((e) => starters.has(e.id)).slice(0, 3)

  // 検索索引(タイトル+概要欄プレーンテキスト。転送量を抑えるため600字まで)
  const indexRows: IndexRow[] = episodes.map((ep) => ({
    id: ep.id,
    title: ep.title,
    date: ep.date,
    href: `/podcast/${show.slug}/${ep.id}`,
    searchText: htmlToPlainText(ep.description).slice(0, 600),
  }))

  // NEWドット境界(7日前)とWaveformHeroへ渡す連続再生キュー素材
  const newSince = tokyoDaysAgo(7)
  const playable = episodes
    .filter((e) => e.audioUrl)
    .map((e) => ({
      audioUrl: e.audioUrl!,
      showName: show.display ?? show.name,
      title: e.title,
      date: dateDots(e.date),
      href: `/podcast/${show.slug}/${e.id}`,
    }))

  return (
    <div className="measure">
      <section className="section show-header">
        {/* 初見者が「本人の番組か制作参加か」を判別できる棚見出し(2026-07-14 Andy指摘)。
            語彙はHomeの棚(PODCAST — ORIGINAL/WORKS)と同一=サイト内で意味が通る */}
        <div className="section-head show-shelf-head">
          <span>PODCAST — {isOriginal ? 'ORIGINAL' : 'WORKS'}</span>
        </div>
        {feed?.image && (
          <div className="sq cover-frame show-cover">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imgThumb(feed.image, IMG_W.tile)} alt={show.name} decoding="async" />
          </div>
        )}
        <h1 className="show-title">{feed?.title || show.name}</h1>
        {/* 所属の一行(初見への直接回答)。詳細な担当領域はROLE欄 */}
        <p className="show-affiliation">
          {isOriginal ? 'Andyのオリジナル番組' : 'Andyが制作参加する番組'}
        </p>
        {/* 配信先(番組単位)。設定された分だけ */}
        <PlatformLinks platforms={show.platforms} />
        {/* この番組だけの連続再生(全番組共通)。選ばずに聴き始められる入口 */}
        <ShowPlayAll episodes={playable} />
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

      {/* 入門3選(ORIGINALのみ): 逆時系列は初見の入口として機能しないため、
          Andyが選んだ「まずこの3本」を置く。studioで「入門」タグを付けると載る */}
      {isOriginal && starterEps.length > 0 && (
        <section className="section">
          <div className="section-head">
            <span>STARTERS — まずこの3本</span>
          </div>
          <div className="section-body starter-list">
            {starterEps.map((ep) => (
              <Link key={ep.id} href={`/podcast/${show.slug}/${ep.id}`} className="starter-row">
                {(ep.image ?? feed?.image) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imgThumb(ep.image ?? feed!.image, IMG_W.ep)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <span className="starter-title">{ep.title}</span>
                <span className="starter-date">{dateShort(ep.date)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ROLE: 番組カタログがポートフォリオを兼ねる(旧サイト移植)。文言未設定なら出さない */}
      {show.role && (
        <section className="section">
          <div className="section-head">
            <span>ROLE</span>
          </div>
          <p className="show-role">{show.role}</p>
        </section>
      )}

      {episodes.length > 0 && <EpisodeIndex rows={indexRows} newSince={newSince} />}
    </div>
  )
}
