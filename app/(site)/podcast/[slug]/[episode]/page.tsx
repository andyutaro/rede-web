import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { showBySlug } from '@/lib/site/shows'
import { fetchShowFeed } from '@/lib/site/podcastFeed'
import { createService } from '@/lib/supabase/service'
import { dateDots, scribeTitle } from '@/lib/site/text'
import Accordion from '../../../about/Accordion'
import Pager from '../../../Pager'
import EpisodeNotes from '../../EpisodeNotes'
import AudioPlayer from '../../AudioPlayer'
import PlatformLinks from '../../PlatformLinks'
import { imgThumb, IMG_W } from '@/lib/site/img'

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
// この回が作られた頃のscribe(ORIGINALのみ、2026-07-20): リリース日の前1週間+当日の
// 確定日誌を最大3件。scribeは最近始めたので、古い回では自然に空=何も出ない
async function scribeAround(date: string): Promise<string[]> {
  const from = new Date(`${date}T00:00:00Z`)
  from.setUTCDate(from.getUTCDate() - 7)
  const service = createService()
  const { data } = await service
    .from('scribe_days')
    .select('date')
    .not('finalized_at', 'is', null)
    .is('deleted_at', null)
    .gte('date', from.toISOString().slice(0, 10))
    .lte('date', date)
    .order('date', { ascending: false })
    .limit(3)
  return (data ?? []).map((d) => d.date as string)
}

export default async function EpisodePage({ params }: { params: Promise<Params> }) {
  const data = await loadEpisode(params)
  if (!data) notFound()
  const { show, feed, ep } = data
  const isOriginal = show.group === 'original'
  const scribeDates = isOriginal ? await scribeAround(ep.date) : []

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
        {/* 右側に所属バッジ(2026-07-14 Andy指摘): 初見者が「本人の番組か制作参加か」を
            エピソード直リンクでも判別できる。WORKSは単語だけでは通じないので注記付き */}
        <div className="section-head">
          <span>{(show.display ?? show.name).toUpperCase()} — {dateDots(ep.date)}</span>
          <span className="head-affiliation">
            {show.group === 'original' ? 'ORIGINAL' : 'WORKS — 制作参加'}
          </span>
        </div>
        <div className="episode-header">
          {thumb && (
            <div className="sq cover-frame episode-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imgThumb(thumb, IMG_W.tile)} alt="" decoding="async" />
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

          {/* この回への便り(ORIGINALのみ、2026-07-20): コメント欄は置かない(ソロ運営)。
              contactフォームに回のタイトルを焼き込んだ最小の私信の口 */}
          {isOriginal && (
            <Link
              className="ep-letter"
              href={`/contact?ep=${encodeURIComponent(`${show.display ?? show.name}『${ep.title}』`)}`}
            >
              この回への便りを送る →
            </Link>
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
        {/* この頃のscribe(ORIGINALのみ): 番組(表)と日誌(裏)を両方持つのはこのサイトだけ。
            エピソードの周辺で書かれていたものへの扉 */}
        {scribeDates.length > 0 && (
          <div className="ep-scribe">
            <div className="listen-caption">この頃のscribe</div>
            <div className="ep-scribe-rows">
              {scribeDates.map((d) => (
                <Link key={d} href={`/scribe/${d}`}>
                  SCRIBE『{scribeTitle(d)}』
                </Link>
              ))}
            </div>
          </div>
        )}

        <Pager
          older={pagerLink(olderEp)}
          newer={pagerLink(newerEp)}
          back={{ href: `/podcast/${show.slug}`, title: show.display ?? show.name }}
        />
      </article>
    </div>
  )
}
