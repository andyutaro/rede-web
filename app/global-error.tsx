'use client'

import './globals.css'
import './(site)/site.css'
import { THEME_INIT } from '@/lib/site/theme'

// ルートレイアウト自体が壊れた場合の最後の受け皿(2026-07-23)。
// ここはレイアウトを置き換えるのでhtml/bodyと地の指定を自分で持つ必要がある。
// クライアントコンポーネント必須のためmetadataは使えず、titleはReactの<title>で置く。
// 到達はごく稀(この画面が出る=レイアウトが壊れている)なので、
// フォントの読み込みまではせず地の色と文字だけで静かに置く。
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <html lang="ja">
      <body>
        {/* この画面はNextのmetadataの木ごと差し替わるため、SSRシェルのmetaが
            クライアントで消える。viewportが無いとスマホが約980px幅で描画して
            文字が読めない大きさになるので自分で置く(Reactがheadへ巻き上げる) */}
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Error — Andy</title>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {/* site-standalone: この画面はReactが文書ごと描き直す経路があり、上のスクリプトが
            走らないことがある。その時のためにOSの配色設定にも従わせる(site.css側で指定) */}
        <div className="site site-standalone">
          <main className="site-main">
            <div className="measure">
              <section className="section">
                <div className="section-head">
                  <span>ERROR</span>
                </div>
                <div className="section-body nf-body">
                  <p className="nf-line">うまく表示できませんでした。</p>
                  <p className="nf-sub">
                    一時的なものかもしれません。もう一度試すか、時間をおいてお越しください。
                  </p>
                  <div className="nf-links">
                    <button type="button" className="nf-retry" onClick={() => unstable_retry()}>
                      もう一度試す →
                    </button>
                    {/* ここはルートレイアウトごと壊れている状態なので、
                        ルーター経由(next/link)ではなく完全な再読込で抜ける */}
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a href="/">Home へ →</a>
                  </div>
                  {error.digest && <p className="nf-digest">{error.digest}</p>}
                </div>
              </section>
            </div>
          </main>
        </div>
      </body>
    </html>
  )
}
