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
import { fetchShowFeed, randomAudioEpisodeByShow } from '@/lib/site/podcastFeed'
import { dateDots } from '@/lib/site/text'
import './site.css'

// 細字タイポ(200/300)が杉本肌の核。400以上は使わない
const noto = Noto_Sans_JP({
  variable: '--font-noto',
  subsets: ['latin'],
  weight: ['200', '300'],
})

export const metadata: Metadata = {
  title: {
    default: 'Andy 〔 Podcaster 〕',
    template: '%s — Andy',
  },
  description: 'Andy — Podcaster',
}

// テーマの初期適用はペイント前にインラインスクリプトで行う(FOUC防止)。
// キーはandy-theme("dark"/"light")、既定はライト。
const THEME_INIT = `try{if(localStorage.getItem('andy-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}`

// 背景波形+ランダム再生は全ページ共通(2026-07-13、旧: Homeのみ)。
// 音源はON-AIRDO・ミモリラジオ・サカナカイギの3番組から(2026-07-14 Andy指定)。
// まず番組を等確率で選び、次にその番組内でランダム1本(番組選択は均等)。
// フィードは各30分キャッシュ。
//
// layout本体でawaitせずSuspenseでストリーミングする(2026-07-14): キャッシュが
// 冷えている時にRSS取得が全ページのシェル描画(ヘッダー/本文/フッター)を
// ブロックしないため。fallbackは同じ波形(episode=null)なので差し替えは無縫
// (波形はグローバルなrAF時刻から決定的に描かれる)。
async function HeroEpisode() {
  const heroShows = ['onairdo', 'mimoriradio', 'sakanakaigi']
    .map(showBySlug)
    .filter((s): s is Show => !!s?.feed)
  const feeds = await Promise.all(heroShows.map((s) => fetchShowFeed(s.feed!, s.since)))
  const pick = randomAudioEpisodeByShow(feeds)
  const heroShow = pick ? heroShows[pick.feedIndex] : null
  const heroEpisode =
    pick && heroShow && pick.episode.audioUrl
      ? {
          audioUrl: pick.episode.audioUrl,
          showName: heroShow.display ?? heroShow.name,
          title: pick.episode.title,
          // リリース日(年月日、2026-07-14 Andy指定)。表記はエピソードページと同じドット式
          date: dateDots(pick.episode.date),
          href: `/podcast/${heroShow.slug}/${pick.episode.id}`,
        }
      : null
  return <WaveformHero episode={heroEpisode} />
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`site ${noto.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      {/* 背景波形(固定・z:-1)+サウンドオン。全ページ共通。エピソード解決を待たず波形を出す */}
      <Suspense fallback={<WaveformHero episode={null} />}>
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
