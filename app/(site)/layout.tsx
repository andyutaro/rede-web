import type { Metadata } from 'next'
import Link from 'next/link'
import { Noto_Sans_JP } from 'next/font/google'
import NavLinks from './NavLinks'
import ThemeToggle from './ThemeToggle'
import SiteMenu from './SiteMenu'
import Wordmark from './Wordmark'
import ImageLightbox from './ImageLightbox'
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

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`site ${noto.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
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
        <main>{children}</main>
      </ImageLightbox>
      <footer className="site-footer">
        <div className="measure">
          <NavLinks />
          <div className="copyright">
            © 2026 YUTARO YASUDA
            <Link href="/privacy" className="footer-privacy">
              PRIVACY POLICY
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
