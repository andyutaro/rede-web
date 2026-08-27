import Link from 'next/link'
import { createService } from '@/lib/supabase/service'
import { todayInTokyo } from '@/lib/scribe/date'
import { recentUpdates } from '@/lib/site/updates'
import { randomPhotoWithHref } from '@/lib/site/photos'
import { isRecentlyWritten } from '@/lib/site/serverBody'
import { SHOWS } from '@/lib/site/shows'
import { channelInfo } from '@/lib/site/podcastFeed'
import { tokyoDaysAgo } from '@/lib/site/text'
import CoverGrid from './CoverGrid'
import LiveWindow from './LiveWindow'
import UpdateList from './UpdateList'
import { imgCover, IMG_W } from '@/lib/site/img'

// ISR 60秒(2026-08-05)。以前は force-dynamic だった=一番人が来るページを
// 毎リクエスト組み直していて、Error 1102(CPU 10ms超過)が**混んだ日に集中して**
// 出ていた。人が来た時にだけ壊れて見えるという一番まずい出方だったので、
// Homeから静める。1分あれば突発的な集中(SNSで流れた等)はほぼキャッシュが吸う。
//
// 60秒間だけ据え置きになるもの:
// - scribeの当日窓 … クライアントがマウント後に中継へ繋いで上書きするので、
//   人の画面では実質いままで通り。据え置きが見えるのはJSを実行しない読み手だけ。
//   生存表示(recentlyWritten)も3分の近似なので1分のずれは吸収される。
// - ランダム写真とPODCASTピルのキュー … 1分ごとに引き直し。
//   ピルのキューは/aboutなど既にISRのページで同じ扱い(layout側の既存の前提)。
// - UPDATES … 元より日単位の粒度。
export const revalidate = 60

// Homeの写真1枚は「枠が先、写真が後」(2026-08-27 Andy指定
// 「縦長写真だとデカすぎてダサい」)。横位置の写真を基準にした3:2の窓に切り取る。
// 写真全体を正確に出すことより枠の形を優先する=1枚がHomeを占拠しない。
// CSS側(.photo-single)のaspect-ratioと必ず同じ比にすること
const PHOTO_FRAME_H = Math.round((IMG_W.photo * 2) / 3)

export const metadata = {
  alternates: { canonical: 'https://andyutaro.com' },
}

// 検索エンジンへの身元表明(2026-07-25、JSON-LD)。事実データのみ(散文なし)。
// InstagramはロングポストのAndy自身の紹介文に出る公開アカウント
const IDENTITY_JSONLD = JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Person',
      '@id': 'https://andyutaro.com/#andy',
      name: 'Andy',
      alternateName: '安田裕太郎',
      jobTitle: 'Podcaster',
      url: 'https://andyutaro.com',
      image: 'https://andyutaro.com/og.jpg',
      sameAs: ['https://www.instagram.com/andyutaro/'],
    },
    {
      '@type': 'WebSite',
      name: 'Andy 〔 Podcaster 〕',
      url: 'https://andyutaro.com',
      publisher: { '@id': 'https://andyutaro.com/#andy' },
    },
  ],
}).replace(/</g, '\\u003c')

// Home構成(handoff-notes §2、上から):
// ワードマーク/ナビ(layout) → Podcast Original → Podcast Works →
// UPDATES → scribe窓 → Photography → Tags → フッター(layout)
export default async function Home() {
  const today = todayInTokyo()
  const service = createService()

  const [todayRes, updates, photo, covers] = await Promise.all([
    service.from('scribe_days').select('html, updated_at').eq('date', today).maybeSingle(),
    recentUpdates(10, true, true), // Home: ミニマル表記+scribeは当日分のみ(2026-07-20)
    // ランダム写真+掲載ページへのリンク(Photography > Notes > scribeの順で解決)
    randomPhotoWithHref(),
    // 番組カバー+最新エピソード日付はRSSから自動取得
    // (カバーは番組全体のアート。エピソード画像ではない)
    Promise.all(
      SHOWS.map((s) =>
        s.feed ? channelInfo(s.feed, s.since) : Promise.resolve({ image: null, latest: null })
      )
    ),
  ])

  const initialHtml = todayRes.data?.html || null
  const recentlyWritten = isRecentlyWritten(todayRes.data?.updated_at as string | null)

  // 背景波形+ランダム再生はlayoutへ移設(全ページ共通、2026-07-13)。Homeは通常のmeasure構成に戻す
  // カバーが取れた番組だけ出す(フィード未設定・取得失敗はプレースホルダを出さない)。
  // 並びは各群とも最新エピソードが新しい順(左が最新)
  const withArt = SHOWS.map((s, i) => ({
    ...s,
    cover: covers[i].image,
    latest: covers[i].latest,
  }))
    .filter((s): s is typeof s & { cover: string } => Boolean(s.cover))
    .sort((a, b) => (b.latest ?? '').localeCompare(a.latest ?? ''))
  const originals = withArt.filter((s) => s.group === 'original')
  const works = withArt.filter((s) => s.group === 'works')
  const onAirSince = tokyoDaysAgo(4)

  return (
    <div className="measure">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: IDENTITY_JSONLD }} />
      <h1 className="sr-only">Andy — Podcaster</h1>
      {/* onAirSince: 4日以内に更新された番組の日付がON AIR表示になる(2026-08-05)。
          ISR60秒なので境界は最大1分ぶん古いが、3日の窓に対しては誤差にならない */}
      {originals.length > 0 && (
        <CoverGrid heading="PODCAST — ORIGINAL" shows={originals} onAirSince={onAirSince} />
      )}
      {works.length > 0 && <CoverGrid heading="PODCAST — WORKS" shows={works} onAirSince={onAirSince} />}

      <section className="section">
        <div className="section-head">
          <h2>UPDATE — LAST 10 DAYS</h2>
          <Link href="/updates">ALL →</Link>
        </div>
        <div className="section-body">
          <UpdateList rows={updates} />
        </div>
      </section>

      <LiveWindow
        relay={process.env.SCRIBE_RELAY_URL ?? null}
        today={today}
        initialHtml={initialHtml}
        recentlyWritten={recentlyWritten}
      />

      {/* 見出しはPhotographyのまま存続(§11: Homeの統一感を優先する司令塔決定)。
          母集団はサイト内の全アップロード写真 */}
      {photo && (
        <section className="section">
          <div className="section-head">
            <h2>PHOTO</h2>
          </div>
          <div className="section-body photo-single">
            {/* 掲載ページ(Photography作品/Notes記事/scribe)へのリンクは
                randomPhotoWithHrefが本文照合で解決済み */}
            {photo.href ? (
              // 中身は装飾のimgだけでリンク名が空だった(2026-07-23)
              <Link href={photo.href} aria-label="この写真の掲載ページへ">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={imgCover(photo.url, IMG_W.photo, PHOTO_FRAME_H)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
              </Link>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgCover(photo.url, IMG_W.photo, PHOTO_FRAME_H)}
                alt=""
                loading="lazy"
                decoding="async"
              />
            )}
          </div>
        </section>
      )}

      {/* Tags(§7)は手動タグ付け開始まで非表示(ダミー不可)。タグ実装時にここへ */}
    </div>
  )
}
