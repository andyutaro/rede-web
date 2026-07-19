import type { Metadata } from 'next'
import { Suspense } from 'react'
import Link from 'next/link'
import { Noto_Sans_JP } from 'next/font/google'
import NavLinks from './NavLinks'
import ThemeToggle from './ThemeToggle'
import SiteMenu from './SiteMenu'
import Wordmark from './Wordmark'
import WaveformHero from './WaveformHero'
import ImageLightbox from './ImageLightbox'
import { showBySlug, type Show } from '@/lib/site/shows'
import { fetchShowFeed, randomEpisodeQueue } from '@/lib/site/podcastFeed'
import { dateDots } from '@/lib/site/text'
import './site.css'

// 細字タイポ(200/300)が杉本肌の核。400以上は使わない
const noto = Noto_Sans_JP({
  variable: '--font-noto',
  subsets: ['latin'],
  weight: ['200', '300'],
})

export const metadata: Metadata = {
  // metadataBaseはルートレイアウト(app/layout.tsx)で全ルートに設定済み
  title: {
    default: 'Andy 〔 Podcaster 〕',
    template: '%s — Andy',
  },
  description: 'Andy — Podcaster',
  // OGP/Twitter画像とカード種別はルートレイアウトで宣言済み(ここでtwitterを
  // 再定義するとルートのtwitter設定ごと上書きされるため定義しない)
}

// テーマの初期適用はペイント前にインラインスクリプトで行う(FOUC防止)。
// キーはandy-theme("dark"/"light")、既定はライト。
const THEME_INIT = `try{if(localStorage.getItem('andy-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}`

// 背景波形+PODCAST連続再生は全ページ共通(2026-07-19)。
// 音源はON-AIRDO・ミモリラジオ・サカナカイギの3番組から番組均等のラウンドロビンで
// 10本のキューを組む(約5〜8時間分=実質無限)。フィードは各30分キャッシュ。
// 1本目は10:00地点から=「放送中の局に途中から合流する」、2本目以降は頭から
// =「次の番組が始まる」(途中から再生と連続再生の体験統合、WaveformHero側で制御)。
//
// layout本体でawaitせずSuspenseでストリーミングする(2026-07-14): キャッシュが
// 冷えている時にRSS取得が全ページのシェル描画(ヘッダー/本文/フッター)を
// ブロックしないため。fallbackは同じ波形(episodes=null)なので差し替えは無縫
// (波形はグローバルなrAF時刻から決定的に描かれる)。
async function HeroEpisode() {
  const heroShows = ['onairdo', 'mimoriradio', 'sakanakaigi']
    .map(showBySlug)
    .filter((s): s is Show => !!s?.feed)
  const feeds = await Promise.all(heroShows.map((s) => fetchShowFeed(s.feed!, s.since)))
  const episodes = randomEpisodeQueue(feeds, 10).map(({ feedIndex, episode }) => {
    const show = heroShows[feedIndex]
    return {
      audioUrl: episode.audioUrl!,
      showName: show.display ?? show.name,
      title: episode.title,
      // リリース日(年月日、2026-07-14 Andy指定)。表記はエピソードページと同じドット式
      date: dateDots(episode.date),
      href: `/podcast/${show.slug}/${episode.id}`,
    }
  })
  return <WaveformHero episodes={episodes.length > 0 ? episodes : null} />
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`site ${noto.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      {/* 背景波形(固定・z:-1)+サウンドオン。全ページ共通。エピソード解決を待たず波形を出す */}
      <Suspense fallback={<WaveformHero episodes={null} />}>
        <HeroEpisode />
      </Suspense>
      {/* 右上の縦積みUI(上から): テーマスイッチ → Contactピル → MENU */}
      <ThemeToggle />
      {/* Contactはナビから外し、テーマトグルの下に固定ピルとして置く(2026-07-12)。
          穏やかに明滅して存在を知らせる。ホバーで明滅停止。 */}
      <Link href="/contact" className="contact-pill">
        Contact
      </Link>
      {/* ナビはMENUに格納(2026-07-12)。押すとオーバーレイで縦一列に展開 */}
      <SiteMenu />
      <header className="site-header measure">
        <Wordmark />
      </header>
      <ImageLightbox>
        <main className="site-main">{children}</main>
      </ImageLightbox>
      <footer className="site-footer">
        <div className="measure">
          <NavLinks />
          <div className="copyright">
            © 2026 ANDY YUTARO YASUDA
            <Link href="/privacy" className="footer-privacy">
              PRIVACY POLICY
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
