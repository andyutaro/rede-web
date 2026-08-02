import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SHOWS, showBySlug } from '@/lib/site/shows'
import { fetchShowFeed } from '@/lib/site/podcastFeed'
import { breadcrumbJsonLd } from '@/lib/site/breadcrumbs'
import { dateDots, dateShort, firstImageSrc, plainExcerpt, tokyoDaysAgo, tokyoYmd } from '@/lib/site/text'
import { createService } from '@/lib/supabase/service'
import { assignedOf, listAllImages } from '@/lib/site/photos'
import { imgThumb, IMG_W } from '@/lib/site/img'
import Accordion from '../../about/Accordion'
import Linkified from '../../Linkified'
import PlatformLinks from '../PlatformLinks'
import EpisodeIndex, { type IndexRow } from '../EpisodeIndex'
import ShowPlayAll from '../ShowPlayAll'
import ShowHeroWater from '../ShowHeroWater'
import PlaceMap from '../../PlaceMap'

// ISR: 30分ごとに再検証し、新エピソードを自動で番組ページに反映する
export const revalidate = 1800

// 番組は5枠で既知なのでビルド時にプリレンダー(feedのある番組のみ)。
// 各ページは30分ごとに背景で再生成され、新エピソードが乗る。
export function generateStaticParams() {
  return SHOWS.filter((s) => s.feed).map((s) => ({ slug: s.slug }))
}

// dynamicParams=falseは試して取り下げた(2026-07-23)。ステータスは404になるが
// Nextの組み込み404(英語)が出てしまい、人が見る画面としては悪化する。
// 知らないslugはページ側のnotFound()に任せる=サイトの言葉の404が出る。
// ストリーミング中なのでステータスは200のままだが、Nextがnoindexを入れるため
// 検索には載らない(node_modules/next/dist/docs .../loading.md の Status Codes)

type Params = { slug: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { slug } = await params
  const show = showBySlug(slug)
  if (!show?.feed) return { title: show?.name ?? 'Podcast' }
  // description: RSSのchannel説明(番組側の言葉)から抜粋(2026-07-25)。
  // channelInfoは軽量フィード(description空)なので、ページ本体と同じフルフィードを
  // 使う(30分キャッシュ共有=追加コストなし)。不在時はサイト共通descriptionに落ちる
  const feed = await fetchShowFeed(show.feed, show.since)
  const description = feed?.description ? plainExcerpt(feed.description, 120) : undefined
  // 番組単位のOGP(2026-07-22): カードに番組カバーを出す(エピソードページと同じ文法)
  const img = `https://andyutaro.com/api/og-image?show=${show.slug}`
  return {
    title: show.name,
    description,
    alternates: { canonical: `https://andyutaro.com/podcast/${show.slug}` },
    // /api/og-imageが紙色で額装した1200×630へ解決するので大きいカードで出す
    // (2026-07-29。正方形アートのままsummary_large_imageにすると上下が切られた)
    openGraph: { title: show.name, images: [{ url: img, alt: show.name, width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', images: [{ url: img, alt: show.name }] },
  }
}

// 入門3選(2026-07-20): studioのPODCAST INBOXで「入門」タグを付けた回。
// RSSには「推奨入口」という概念が無い=アプリに出来ない編集行為。
// 当初ORIGINAL限定だったが全番組で設定可に(2026-07-23 Andy)。「どこから聴くか」の
// 案内は制作参加番組でも同じ値打ちがある(おたより・scribe裏面はORIGINAL限定のまま)
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

// 番組から派生したプロダクト(2026-07-25 Andy指定): shows.tsのproducts
// (physical記事ID)を、指定の並び順のまま引く。サムネイル解決は
// Physical棚と同一(manual > 本文の最初の画像 > 充当=グレースケール)。
// 催し(type=event)の紐づけも同じ形なのでこの関数を共有する(2026-07-29)
type ProductCell = { id: string; title: string; date: string; thumb: string | null; assigned: boolean }

async function productCells(ids?: string[]): Promise<ProductCell[]> {
  if (!ids?.length) return []
  const service = createService()
  const [{ data }, pool] = await Promise.all([
    service.from('articles').select('*').in('id', ids),
    listAllImages(),
  ])
  const byId = new Map((data ?? []).map((a) => [a.id as string, a]))
  return ids
    .map((id) => byId.get(id))
    .filter((a): a is NonNullable<typeof a> =>
      Boolean(a && a.status === 'published' && a.published_at && !a.deleted_at)
    )
    .map((a) => {
      const first = firstImageSrc((a.html as string) ?? '')
      const thumb = (a.thumbnail_url as string | null) ?? first ?? assignedOf(pool, a.id as string)
      return {
        id: a.id as string,
        title: ((a.title as string) || '').trim() || '(無題)',
        date: tokyoYmd(a.published_at as string),
        thumb,
        assigned: !a.thumbnail_url && !first && Boolean(thumb),
      }
    })
}

// 番組ページ: カバー・番組名・配信先・入門3選・連続再生・
// SHOW NOTES・検索付きエピソード索引。
export default async function ShowPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const show = showBySlug(slug)
  if (!show || !show.feed) notFound()

  const isOriginal = show.group === 'original'
  const [feed, starters, products, events] = await Promise.all([
    fetchShowFeed(show.feed, show.since),
    starterIds(slug),
    productCells(show.products),
    productCells(show.events),
  ])

  const episodes = feed?.episodes ?? []
  const starterEps = episodes.filter((e) => starters.has(e.id)).slice(0, 3)

  // 検索索引(タイトル+概要欄プレーンテキスト600字、パース時に計算済み)
  const indexRows: IndexRow[] = episodes.map((ep) => ({
    id: ep.id,
    title: ep.title,
    date: ep.date,
    href: `/podcast/${show.slug}/${ep.id}`,
    searchText: ep.searchText,
  }))

  // NEWドット境界(7日前)と「作業用まとめ聞き」のキュー素材。
  // フィードは新しい順なので反転して第1回からの放送順にする(2026-08-01)。
  // 番組ページのボタンは「この番組を最初から通して流す」担当で、途中から流したい時は
  // エピソードページ側の「この回から」を使う
  const newSince = tokyoDaysAgo(7)
  const playable = episodes
    .filter((e) => e.audioUrl)
    .reverse()
    .map((e) => ({
      audioUrl: e.audioUrl!,
      showName: show.display ?? show.name,
      title: e.title,
      date: dateDots(e.date),
      href: `/podcast/${show.slug}/${e.id}`,
    }))

  // 検索エンジン向けの番組の構造化データ(2026-07-25、事実データのみ)
  const seriesJsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'PodcastSeries',
    name: feed?.title || show.name,
    url: `https://andyutaro.com/podcast/${show.slug}`,
    ...(feed?.image ? { image: feed.image } : {}),
    ...(feed?.description ? { description: plainExcerpt(feed.description, 200) } : {}),
    webFeed: show.feed,
    ...(isOriginal ? { author: { '@type': 'Person', name: 'Andy', url: 'https://andyutaro.com' } } : {}),
    // 出演者(2026-07-29)。ページに書いた事実をそのまま検索エンジンにも渡す
    ...(show.cast?.length
      ? {
          actor: show.cast.map((m) => ({
            '@type': 'Person',
            name: m.name,
            ...(m.href?.startsWith('http') ? { sameAs: m.href } : {}),
          })),
        }
      : {}),
  }).replace(/</g, '\\u003c')

  // パンくず(2026-07-25): 検索結果の階層表示用
  const crumbs = breadcrumbJsonLd([
    { name: 'Home', path: '' },
    { name: 'Podcast', path: '/podcast' },
    { name: feed?.title || show.name, path: `/podcast/${show.slug}` },
  ])

  return (
    <div className="measure">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: seriesJsonLd }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: crumbs }} />
      <section className="section show-header">
        {/* 番組の識別部(棚見出し・カバー・番組名・所属)。heroVideoを持つ番組は
            この一塊の背後にイワシの水を沈め、グローバル波形がその上を泳ぐ(2026-07-25)。
            カバータイルはそのまま=水の上に白いタイルが浮く。 */}
        {(() => {
          const identity = (
            <>
              {/* 初見者が「本人の番組か制作参加か」を判別できる棚見出し(2026-07-14 Andy指摘)。
                  語彙はHomeの棚(PODCAST — ORIGINAL/WORKS)と同一=サイト内で意味が通る */}
              <div className="section-head show-shelf-head">
                <h2>PODCAST — {isOriginal ? 'ORIGINAL' : 'WORKS'}</h2>
              </div>
              {feed?.image && (
                <div className="sq cover-frame show-cover">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgThumb(feed.image, IMG_W.tile)} alt={show.name} decoding="async" />
                </div>
              )}
              <h1 className="show-title">{feed?.title || show.name}</h1>
            </>
          )
          return show.heroVideo ? (
            <div className="show-hero on-water">
              <ShowHeroWater base={show.heroVideo} />
              {identity}
            </div>
          ) : (
            identity
          )
        })()}
        {/* 所属の一行(初見への直接回答)。詳細な担当領域はROLE欄。
            水の外=紙の上に置く(2026-07-29 Andy)。水がフェードして紙になる帯に
            ちょうど重なり、明色の文字が沈んでほぼ読めなかった。
            舞台の銘板で同じ問題が起きたときと同じ判断 */}
        <p className="show-affiliation">
          {isOriginal ? 'Andyのオリジナル番組' : 'Andyが制作参加する番組'}
        </p>
        {/* 番組の言葉(2026-07-29 Andy): 何の番組かが最初に出てこなかった
            (SHOW NOTESは畳まれている)。水の外=紙の上に置く */}
        {show.intro && <p className="show-intro">{show.intro}</p>}
        {/* 番組の舞台(2026-07-25 → 2026-07-30に地図へ)。
            「女川」「白老」と書かれても分かる人は少ない。初見の人、そして
            フィジカルを入口に海外から来る人に、図で一目で伝える。
            座標の活字は地図が同じことを言うので落とした(冗長を残さない)。
            地名は日本語+英語の2行に畳む */}
        {show.place && (
          <div className="show-place">
            <PlaceMap
              points={show.place.points}
              view={show.place.view}
              link={show.place.points.length > 1}
            />
            <p className="show-place-name">{show.place.ja}</p>
            <p className="show-place-en">{show.place.en}</p>
            {show.place.note && <p className="show-place-note">{show.place.note}</p>}
          </div>
        )}
        {/* 出演者(2026-07-29 Andy): 番組を探して来た人の最初の問いは「誰の声か」。
            銘板の下に名前と担当だけを置く(写真は持ち込まない=本人の肖像を
            番組側で決めない)。アカウントを公開している人は名前がリンクになる */}
        {show.cast && show.cast.length > 0 && (
          <div className="show-cast">
            <p className="show-cast-label">出演</p>
            <ul className="show-cast-list">
              {show.cast.map((m) => (
                <li key={m.name}>
                  {m.href ? (
                    m.href.startsWith('/') ? (
                      <Link className="show-cast-name" href={m.href}>
                        {m.name}
                      </Link>
                    ) : (
                      <a
                        className="show-cast-name"
                        href={m.href}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {m.name}
                      </a>
                    )
                  ) : (
                    <span className="show-cast-name">{m.name}</span>
                  )}
                  <span className="show-cast-role">{m.role}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* 配信先(番組単位)。設定された分だけ。
            小さなラベルで括るのはエピソードページと同じ文法(2026-07-29 統一) */}
        {show.platforms && (
          <div className="episode-listen">
            <div className="listen-caption">配信先で聴く</div>
            <PlatformLinks platforms={show.platforms} />
          </div>
        )}
        {/* 番組への行動は1行に(2026-07-29): 連続再生とおたよりは「この番組に
            関わる」同じ性質なので、縦に積まず1つの群として横に並べる。
            ・連続再生 = 選ばずに聴き始められる入口(全番組共通)
            ・おたより = 継続中のORIGINALはサイト内フォーム、専用フォームを
              持つ番組(ON-AIRDO等)は番組自身のフォームへ */}
        <div className="show-actions">
          <ShowPlayAll episodes={playable} label="第1回から作業用まとめ聞き" />
          {isOriginal && !show.ended && !show.otayoriUrl && (
            <Link className="ep-letter" href={`/contact?show=${show.slug}`}>
              番組へのおたよりを送る →
            </Link>
          )}
          {show.otayoriUrl && (
            <a className="ep-letter" href={show.otayoriUrl} target="_blank" rel="noopener noreferrer">
              番組へのおたよりを送る →
            </a>
          )}
        </div>
        {/* ショーノート(channel説明)は長いのでアコーディオン格納(2026-07-10、デフォルト閉)。
            プレーンテキスト(改行保持)。外部由来なのでテキストとして描画し、
            中のURL・ドメイン表記だけLinkifiedでリンク化(2026-07-20、素のままだと全リンクが死ぬ) */}
        {feed?.description && (
          <div className="podcast-fold">
            <Accordion label="SHOW NOTES">
              <p className="show-description">
                <Linkified text={feed.description} />
              </p>
            </Accordion>
          </div>
        )}
      </section>

      {/* セクションの並び(2026-07-25 Andy指定):
          ORIGINAL = STARTERS → EXPANSION → ROLE(通常なし)
          WORKS    = ROLE → STARTERS(制作参加番組は担当の提示が先=ポートフォリオの文法) */}
      {(() => {
        // 入門3選(全番組、2026-07-23にORIGINAL限定を解除): 逆時系列は初見の
        // 入口として機能しないため、Andyが選んだ「まずこの3本」を置く。
        // studioで「入門」タグを付けると載る。
        // 1〜2本しか付いていない間は見出しが嘘にならない文言に落とす
        const starters = starterEps.length > 0 && (
          <section className="section" key="starters">
            <div className="section-head">
              <h2>STARTERS — {starterEps.length === 3 ? 'まずこの3本' : 'まずはここから'}</h2>
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
        )

        // 番組から派生して生まれたもの(2026-07-25 → 2026-07-29 Andy指定で改称・統合):
        // 物(Physical)も催し(Events)も「番組から生まれたもの」という一つの事実なので
        // 節を分けず一続きに並べる。通常の4列より一段深い2列(トップ写真を大きく)、
        // 正方形とラベルの文法は各棚と共通。並びはshows.tsの宣言順(物→催し)
        const expansion = [
          ...products.map((p) => ({ ...p, shelf: 'physical', label: 'PHYSICAL' })),
          ...events.map((e) => ({ ...e, shelf: 'events', label: 'EVENTS' })),
        ]
        const expansionSection = expansion.length > 0 && (
          <section className="section" key="expansion">
            <div className="section-head">
              <h2>EXPANSION — 番組から生まれたもの</h2>
            </div>
            <div className="section-body grid2">
              {expansion.map((item) => (
                <div key={item.id}>
                  <Link
                    href={`/${item.shelf}/${item.id}`}
                    className="sq"
                    aria-label={`${item.label} ${item.title} ${dateShort(item.date)}`}
                  >
                    {item.thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imgThumb(item.thumb, IMG_W.product)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className={item.assigned ? 'thumb-assigned' : undefined}
                      />
                    ) : (
                      <span className="empty-cell" />
                    )}
                  </Link>
                  <div className="ep-cell-label">
                    <span className="ep-show">{item.label}</span>
                    <span className="ep-title">{item.title}</span>
                    <span className="ep-date">{dateShort(item.date)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )

        // ROLE: 番組カタログがポートフォリオを兼ねる(旧サイト移植)。文言未設定なら出さない
        const role = show.role && (
          <section className="section" key="role">
            <div className="section-head">
              <h2>ROLE</h2>
            </div>
            <p className="show-role">{show.role}</p>
          </section>
        )

        return isOriginal ? (
          <>
            {starters}
            {expansionSection}
            {role}
          </>
        ) : (
          <>
            {role}
            {starters}
            {expansionSection}
          </>
        )
      })()}

      {episodes.length > 0 && <EpisodeIndex rows={indexRows} newSince={newSince} />}
    </div>
  )
}
