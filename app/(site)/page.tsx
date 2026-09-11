import Link from 'next/link'
import { createService } from '@/lib/supabase/service'
import { todayInTokyo } from '@/lib/scribe/date'
import { recentUpdates } from '@/lib/site/updates'
import { randomPhotoWithHref, listAllImages, assignedOf } from '@/lib/site/photos'
import { isRecentlyWritten } from '@/lib/site/serverBody'
import { SHOWS } from '@/lib/site/shows'
import { showSummaries, summaryOf } from '@/lib/site/showSummary'
import { tokyoDaysAgo, tokyoYmd, firstImageSrc } from '@/lib/site/text'
import { listGuestRows } from '@/lib/site/guestEpisodes'
import CoverGrid from './CoverGrid'
import LiveWindow from './LiveWindow'
import UpdateList from './UpdateList'
import PodcastEpisodeGrid, { type EpItem } from './podcast/PodcastEpisodeGrid'
import ArticleGrid, { type GridItem } from './notes/ArticleGrid'
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

  const [todayRes, updatesRaw, photo, covers, daysRes, artRes, guestRows, pool] = await Promise.all([
    // finalized_at: 最新書き物のLIVEセルの判定にも使う(当日の行は0:01まで未確定)
    service.from('scribe_days').select('html, updated_at, finalized_at').eq('date', today).maybeSingle(),
    // UPDATE — LATEST 5(2026-09-11 Andy指定): **新しい順に5件、日数では切らない。**
    // 同日の経緯: LAST 10 DAYS(実装は日数ではなく10件だった)→ 7日以内かつ最大5件
    // → 見出しを LATEST 5 に → 見出しどおり日数の絞り込みを外した(更新の少ない週に
    // 「LATEST 5」なのに3件、を起こさないため)。
    // DESKの確定アーカイブも載せる(第3引数false)。2026-07-20に「毎日のscribeで
    // 埋まりすぎる」として当日分だけにしていたのを、同日Andy指定で戻した
    // 当日のDESK(LIVE行)はここでは出さない(2026-09-11 Andy指定)。すぐ下のDESKの窓と
    // 最新書き物のLIVEセルが担うので重複になる。1件多く取って、LIVE行を除いて5件に切る
    recentUpdates(6, true, false),
    // ランダム写真+掲載ページへのリンク(Photography > Notes > scribeの順で解決)
    randomPhotoWithHref(),
    // 番組カバー+最新エピソード日付(カバーは番組全体のアート。エピソード画像ではない)。
    // **夜の作り置きから読む(2026-09-01)。** 以前はここでRSSを番組数ぶん取り、
    // UPDATES側でもう一度取っていた=Homeだけで往復10本。ISRキャッシュのR2読み書きと
    // 合わさって1リクエストのサブリクエスト上限(50本)を越え、作り直しが落ち続けていた
    showSummaries(),
    // 最新書き物(2026-09-11 Andy指定「Notes棚のALLタブと同じもの」)。一覧に要る列だけ、
    // 各4件だけ引く(棚と違って全日分は運ばない)。サムネイルの焼き込み(書き込み)は
    // Notes棚と夜のcronの仕事で、Homeは読むだけ
    service
      .from('scribe_days')
      .select('date, thumbnail_url, thumbnail_source')
      .not('finalized_at', 'is', null)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .limit(4),
    service
      .from('articles')
      .select('id, title, html, thumbnail_url, published_at')
      .eq('status', 'published')
      .eq('type', 'article')
      .order('published_at', { ascending: false })
      .limit(4),
    // 最新エピソードに混ぜるゲスト出演。控えだけ読む=RSSを引かない(Homeは
    // サブリクエスト上限で落ちた前科がある。showSummaryの冒頭の注記)
    listGuestRows(),
    // 充当サムネイルの母集団。Notes棚と同じものを使う=同じ日には同じ1枚が当たる
    // (assignedOfは母集団上のハッシュなので、母集団が違うと別の画像になる)
    listAllImages(),
  ])

  const updates = updatesRaw.filter((r) => !r.live).slice(0, 5)

  // 最新エピソード(2026-09-11 Andy指定「/podcastのエピソードタイルの最新4件」)。
  // 自番組(夜の作り置き)とゲスト出演(控え)を公開日で混ぜる。棚と同じ並び・同じ組版
  const newSince = tokyoDaysAgo(7)
  const eps: EpItem[] = []
  SHOWS.forEach((s) => {
    const sum = summaryOf(covers, s.slug)
    if (!sum) return
    for (const ep of sum.episodes.slice(0, 4)) {
      eps.push({
        key: `${s.slug}-${ep.id}`,
        slug: s.slug,
        epId: ep.id,
        title: ep.title,
        date: ep.date,
        // エピソードアートが作り置きに無いうち(夜のcronまで)は番組カバーで代用
        thumb: ep.image ?? sum.image,
        showLabel: s.display ?? s.name,
        group: s.group,
      })
    }
  })
  for (const g of guestRows) {
    if (!g.date) continue
    eps.push({
      key: `guest-${g.id}`,
      slug: 'guest',
      epId: g.id,
      href: `/podcast/guest/${g.id}`,
      title: g.title,
      date: g.date,
      thumb: g.image,
      showLabel: g.showName,
      group: 'guest',
    })
  }
  eps.sort((a, b) => b.date.localeCompare(a.date))
  const latestEpisodes = eps.slice(0, 4)

  // 最新書き物: Notes棚と同じ規則(LIVEセルが先頭、あとは日付降順、サムネイルは
  // 焼き込み済み → 本文の最初の画像 → 充当)
  const writing: GridItem[] = []
  if (todayRes.data?.html && !todayRes.data.finalized_at) {
    writing.push({ key: `live-${today}`, kind: 'live', date: today, href: '/live' })
  }
  for (const d of daysRes.data ?? []) {
    const date = d.date as string
    const burned = (d.thumbnail_url as string | null) ?? null
    const thumb = burned ?? assignedOf(pool, date)
    writing.push({
      key: `scribe-${date}`,
      kind: 'scribe',
      date,
      href: `/desk/${date}`,
      thumb,
      assigned: burned ? d.thumbnail_source === 'assigned' : Boolean(thumb),
    })
  }
  for (const a of artRes.data ?? []) {
    if (!a.published_at) continue
    const first = firstImageSrc((a.html as string) ?? '')
    const thumb = (a.thumbnail_url as string | null) ?? first ?? assignedOf(pool, a.id as string)
    writing.push({
      key: `article-${a.id}`,
      kind: 'article',
      date: tokyoYmd(a.published_at as string),
      href: `/notes/${a.id}`,
      title: (a.title as string) || '(無題)',
      thumb,
      assigned: !a.thumbnail_url && !first && Boolean(thumb),
    })
  }
  writing.sort((a, b) => {
    if (a.kind === 'live') return -1
    if (b.kind === 'live') return 1
    return a.date < b.date ? 1 : -1
  })
  const latestWriting = writing.slice(0, 4)

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
          <h2>UPDATE — LATEST 5</h2>
        </div>
        <div className="section-body">
          <UpdateList rows={updates} />
        </div>
        {/* 続き・全て見るは右下で統一(2026-09-11 Andy指定)。.section-foot の注記 */}
        <div className="section-foot">
          <Link href="/updates">ALL →</Link>
        </div>
      </section>

      {/* 最新エピソード・最新書き物(2026-09-11 Andy指定)。/podcast と /notes の
          タイルをそのまま最新4件だけ。タブ・検索は出さず、見出しとALL →だけ */}
      {latestEpisodes.length > 0 && (
        <PodcastEpisodeGrid
          heading="PODCAST — LATEST"
          allHref="/podcast"
          episodes={latestEpisodes}
          total={latestEpisodes.length}
          newSince={newSince}
          limit={4}
        />
      )}
      {latestWriting.length > 0 && (
        <ArticleGrid heading="NOTE — LATEST" allHref="/notes" items={latestWriting} limit={4} />
      )}

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
