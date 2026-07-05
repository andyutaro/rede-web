'use client'

const KEY = 'andy-theme'

// ライト時=左に赤の☀︎、ダーク時=右に黄の塗りつぶし三日月(輪郭線のみは視認性が悪いためNG)。
// どちらを見せるかはCSS(html[data-theme])が決めるのでReact状態を持たない
// (初期適用はlayoutのインラインスクリプト、hydration差分も生まれない)。
export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement
    const next = root.dataset.theme !== 'dark'
    if (next) {
      root.dataset.theme = 'dark'
    } else {
      delete root.dataset.theme
    }
    try {
      localStorage.setItem(KEY, next ? 'dark' : 'light')
    } catch {
      // localStorage不可の環境では永続化だけ諦める
    }
  }

  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-label="テーマ切り替え">
      <span className="glyph glyph-sun" aria-hidden="true">
        ☀︎
      </span>
      <span className="glyph glyph-moon" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 16 16">
          <path
            d="M13.6 10.6A6.6 6.6 0 0 1 5.4 2.4a6.6 6.6 0 1 0 8.2 8.2z"
            fill="currentColor"
          />
        </svg>
      </span>
    </button>
  )
}
