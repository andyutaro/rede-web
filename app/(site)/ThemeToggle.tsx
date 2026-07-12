'use client'

const KEY = 'andy-theme'

// テーマ切替スイッチ。空の枠に見えて初見で気づかれない問題(2026-07-12)への対策として、
// トラック内をスライドする丸いノブ(つまみ)を持つ「スイッチ」形状にした。
// ノブは光(左)⇄闇(右)に滑り、グリフ(☀︎/🌙)はノブの中に入る。
// どちらのモードかはCSS(html[data-theme])が決めるのでReact状態は持たない
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
      <span className="tt-track" aria-hidden="true" />
      <span className="tt-thumb" aria-hidden="true">
        <span className="glyph glyph-sun">☀︎</span>
        <span className="glyph glyph-moon">
          <svg width="12" height="12" viewBox="0 0 16 16">
            <path
              d="M13.6 10.6A6.6 6.6 0 0 1 5.4 2.4a6.6 6.6 0 1 0 8.2 8.2z"
              fill="currentColor"
            />
          </svg>
        </span>
      </span>
    </button>
  )
}
