import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { showBySlug } from '@/lib/site/shows'
import { fetchShowFeed } from '@/lib/site/podcastFeed'
import { dateDots, plainExcerpt } from '@/lib/site/text'
import { breadcrumbJsonLd } from '@/lib/site/breadcrumbs'
import Accordion from '../../../about/Accordion'
import Pager from '../../../Pager'
import SamePeriod from '../../../SamePeriod'
import EpisodeNotes from '../../EpisodeNotes'
import AudioPlayer from '../../AudioPlayer'
import PlatformLinks from '../../PlatformLinks'
import ShowPlayAll from '../../ShowPlayAll'
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
  if (!data) return { title: 'Podcast' }
  const { show, feed, ep } = data
  // description: その回の概要欄(番組側の言葉)から抜粋(2026-07-25)。
  // canonicalは?s=1等のクエリ付きシェアURLを正典に束ねる
  const base = {
    title: ep.title,
    description: ep.searchText ? plainExcerpt(ep.searchText, 120) : undefined,
    alternates: { canonical: `https://andyutaro.com/podcast/${show.slug}/${ep.id}` },
  }
  // エピソード単位のOGP(2026-07-22): シェアカードにその回のアートを出す。
  // 画像はAnchor URLの失効に備えて安定ルート(/api/og-image)経由の絶対URL。
  // アートは正方形だが、og-imageが紙色で額装した1200×630へ解決するので
  // 切られずに大きいカードで出せる(2026-07-29。それまでsummaryに落としていた)
  if (!(ep.image ?? feed.image)) return base
  const img = `https://andyutaro.com/api/og-image?show=${show.slug}&ep=${ep.id}`
  const alt = `${show.display ?? show.name}『${ep.title}』`
  return {
    ...base,
    openGraph: { title: alt, images: [{ url: img, alt, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', images: [{ url: img, alt }] },
  }
}

// エピソードページ: タイトル・サムネイル・ネイティブ再生プレイヤー・
// 各配信先への送客ボタン・概要欄の薄いテンプレート。
// 「この頃のscribe」(2026-07-20)は「同じ頃」(SamePeriod)へ一般化した(2026-07-28)。

export default async function EpisodePage({ params }: { params: Promise<Params> }) {
  const data = await loadEpisode(params)
  if (!data) notFound()
  const { show, feed, ep } = data
  const isOriginal = show.group === 'original'

  const thumb = ep.image ?? feed.image

  // 戻る・進む: 同一番組内の前後エピソード(フィードは逆時系列なのでindex+1=古い方)
  const idx = feed.episodes.findIndex((e) => e.id === ep.id)
  const olderEp = feed.episodes[idx + 1]
  const newerEp = idx > 0 ? feed.episodes[idx - 1] : undefined
  const pagerLink = (e?: { id: string; title: string }) =>
    e ? { href: `/podcast/${show.slug}/${e.id}`, title: e.title } : null

  // 「作業用まとめ聞き」の起点をこの回にしたキュー(2026-08-01 Andy指定
  // 「好きなエピソードから連続再生する」)。フィードは新しい順なので、この回から
  // 上(=新しい方)を取って反転する=この回から先へ、放送順に流れる。
  // 「前に聴いた回の続きから追いつく」という聴き方がそのまま成立する向き
  const playFromHere = feed.episodes
    .slice(0, idx + 1)
    .reverse()
    .filter((e) => e.audioUrl)
    .map((e) => ({
      audioUrl: e.audioUrl!,
      showName: show.display ?? show.name,
      title: e.title,
      date: dateDots(e.date),
      href: `/podcast/${show.slug}/${e.id}`,
    }))

  // 検索エンジン向けのエピソード構造化データ(2026-07-25、事実データのみ)
  const epUrl = `https://andyutaro.com/podcast/${show.slug}/${ep.id}`
  const episodeJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'PodcastEpisode',
    name: ep.title,
    url: epUrl,
    datePublished: ep.date,
    ...(ep.searchText ? { description: plainExcerpt(ep.searchText, 200) } : {}),
    ...(thumb ? { image: thumb } : {}),
    ...(ep.audioUrl
      ? { associatedMedia: { '@type': 'MediaObject', contentUrl: ep.audioUrl } }
      : {}),
    partOfSeries: {
      '@type': 'PodcastSeries',
      name: feed.title || show.name,
      url: `https://andyutaro.com/podcast/${show.slug}`,
    },
  }).replace(/</g, '\\u003c')

  // パンくず(2026-07-25): 検索結果の階層表示用
  const crumbs = breadcrumbJsonLd([
    { name: 'Home', path: '' },
    { name: 'Podcast', path: '/podcast' },
    { name: feed.title || show.name, path: `/podcast/${show.slug}` },
    { name: ep.title, path: `/podcast/${show.slug}/${ep.id}` },
  ])

  return (
    <div className="measure">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: episodeJsonLd }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: crumbs }} />
      <article className="section">
        {/* 右側に所属バッジ(2026-07-14 Andy指摘): 初見者が「本人の番組か制作参加か」を
            エピソード直リンクでも判別できる。WORKSは単語だけでは通じないので注記付き */}
        <div className="section-head">
          <h2>{(show.display ?? show.name).toUpperCase()} — {dateDots(ep.date)}</h2>
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
          {/* 尺の単独表示はプレイヤーが無い回だけ(プレイヤー右端の合計時間と
              重複してゴチャつくため、2026-07-22 スマホ整理) */}
          {ep.duration && !ep.audioUrl && <div className="episode-duration">{ep.duration}</div>}

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

          {/* この回への便り(継続中のORIGINALのみ、2026-07-20): コメント欄は置かない(ソロ運営)。
              contactフォームに回のタイトルを焼き込んだ最小の私信の口。
              終了番組(ミモリラジオ等)は宛先が無いため出さない */}
          {/* 番組ページと同じ「行動の群」に入れる(2026-07-29 統一)。
              エピソードページの行動は便り1つだが、器を共有すると
              番組ページと同じ位置・同じ余白に着地する */}
          <div className="show-actions">
            {/* この回を起点にした作業用まとめ聞き(2026-08-01)。番組ページの
                同じボタンが「最新回から」なのに対し、ここは「この回から」 */}
            <ShowPlayAll episodes={playFromHere} label="この回から作業用まとめ聞き" />
            {isOriginal && !show.ended && (
              <Link
                className="ep-letter"
                href={`/mail?show=${show.slug}&ep=${encodeURIComponent(`${show.display ?? show.name}『${ep.title}』`)}`}
              >
                この回への便りを送る →
              </Link>
            )}
            {/* 番組専用の外部おたよりフォームを持つ番組(ON-AIRDO等、2026-07-20):
                サイト内フォームではなく番組自身のフォームへ送る */}
            {show.otayoriUrl && (
              <a
                className="ep-letter"
                href={show.otayoriUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                番組へのおたよりを送る →
              </a>
            )}
          </div>
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
        {/* 同じ頃(2026-07-28): この回の前後7日に生まれた他の仕事。
            番組(表)と日誌(裏)を両方持つのはこのサイトだけ、という強みを日付で結ぶ。
            旧「この頃のscribe」(ORIGINAL限定・scribeのみ)を全種類へ一般化した。
            同じ番組の前後の回はPagerの担当なので除く */}
        <SamePeriod date={ep.date} excludePrefix={`/podcast/${show.slug}/`} />

        <Pager
          older={pagerLink(olderEp)}
          newer={pagerLink(newerEp)}
          back={{ href: `/podcast/${show.slug}`, title: show.display ?? show.name }}
        />
      </article>
    </div>
  )
}
