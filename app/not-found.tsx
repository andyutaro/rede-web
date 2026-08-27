import type { Metadata } from 'next'
import Link from 'next/link'
import { Noto_Sans_JP } from 'next/font/google'
import NotFoundBody from './(site)/NotFoundBody'
import './(site)/site.css'
import { THEME_INIT } from '@/lib/site/theme'

// どのルートにも当たらないURLの404(2026-07-23)。ここはルートレイアウト
// (html/body)の直下で(site)レイアウトを通らないため、公開サイトの地(site.css・
// 細字タイポ・ワードマーク)を自分で最小限だけ立てる。
// 波形やMENUまで持ち込まないのは、行き止まりの頁で音を鳴らし始めないため。
const noto = Noto_Sans_JP({
  variable: '--font-noto',
  subsets: ['latin'],
  weight: ['200', '300'],
})

export const metadata: Metadata = { title: 'Not Found' }

export default function GlobalNotFound() {
  return (
    <div className={`site ${noto.variable}`}>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      <header className="site-header measure">
        <div className="wordmark">
          <Link href="/">Andy</Link>
        </div>
      </header>
      <main className="site-main">
        <NotFoundBody />
      </main>
    </div>
  )
}
