import Link from 'next/link'
import { createService } from '@/lib/supabase/service'
import { todayInTokyo } from '@/lib/scribe/date'
import { recentUpdates } from '@/lib/site/updates'
import { randomPhotoWithHref } from '@/lib/site/photos'
import { isRecentlyWritten } from '@/lib/site/serverBody'
import { SHOWS } from '@/lib/site/shows'
import { showSummaries, summaryOf } from '@/lib/site/showSummary'
import { tokyoDaysAgo } from '@/lib/site/text'
import CoverGrid from './CoverGrid'
import LiveWindow from './LiveWindow'
import UpdateList from './UpdateList'
import { imgCover, IMG_W } from '@/lib/site/img'

// ISR(2026-08-05)。以前は force-dynamic だった=一番人が来るページを
// 毎リクエスト組み直していて、Error 1102が**混んだ日に集中して**出ていた。
// 人が来た時にだけ壊れて見えるという一番まずい出方だったので、Homeから静めた。
//
// **1時間に延ばす(2026-09-03)。** 当初は60秒だった。ISRの作り直しキューを
// 有効にしてから、Homeの作り直しが失敗し続ける嵐が起きた(1日4,488件、
// 22時間自然回復しない)。嵐の量を決めているのは**作り直しが発生する回数**で、
// 60秒だと1分ごと・拠点ごとに機会が生まれ、botがそれを叩き続けていた。
// 1時間にすれば機会は60分の1になる。
//
// 60秒である理由は、調べたらもう残っていなかった。据え置きになるものは:
// - scribeの当日窓 … クライアントがマウント後に中継へ繋いで上書きするので、
//   人の画面では影響なし。据え置きが見えるのはJSを実行しない読み手だけ
// - UPDATES … 元より日単位の粒度
// - ランダム写真 … 引き直しの間隔が延びるだけ。意匠であって機能ではない
// - 番組カバー … 2026-09-02から夜の作り置き(showSummary)なので元より日単位
//
// これで足りなければ次はHomeを動的へ戻す(CPUは実測で /live 299ms と
// /photography 435ms の間の337ms。どちらも動的で問題なく回っている)
export const revalidate = 3600

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
    // 番組カバー+最新エピソード日付(カバーは番組全体のアート。エピソード画像ではない)。
    // **夜の作り置きから読む(2026-09-01)。** 以前はここでRSSを番組数ぶん取り、
    // UPDATES側でもう一度取っていた=Homeだけで往復10本。ISRキャッシュのR2読み書きと
    // 合わさって1リクエストのサブリクエスト上限(50本)を越え、作り直しが落ち続けていた
    showSummaries(),
  ])

  const initialHtml = todayRes.data?.html || null
  const recentlyWritten = isRecentlyWritten(todayRes.data?.updated_at as string | null)

  // 背景波形+ランダム再生はlayoutへ移設(全ページ共通、2026-07-13)。Homeは通常のmeasure構成に戻す
  // カバーが取れた番組だけ出す(フィード未設定・取得失敗はプレースホルダを出さない)。
  // 並びは各群とも最新エピソードが新しい順(左が最新)
  const withArt = SHOWS.map((s) => {
    const sum = summaryOf(covers, s.slug)
    return { ...s, cover: sum?.image ?? null, latest: sum?.latest ?? null }
  })
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
