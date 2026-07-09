import type { Metadata } from 'next'
import Link from 'next/link'
import { Noto_Sans_JP } from 'next/font/google'
import NavLinks from './NavLinks'
import ThemeToggle from './ThemeToggle'
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
      <ThemeToggle />
      <header className="site-header measure">
        <div className="wordmark">
          <Link href="/">
            Andy<span className="wm-role">〔 Podcaster 〕</span>
          </Link>
        </div>
        <NavLinks />
      </header>
      <ImageLightbox>
        <main>{children}</main>
      </ImageLightbox>
      <footer className="site-footer">
        <div className="measure">
          <NavLinks />
          <div className="copyright">© 2026 YUTARO YASUDA</div>
        </div>
      </footer>
    </div>
  )
}
