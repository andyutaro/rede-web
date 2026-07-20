'use client'

// 「この番組を連続再生」(2026-07-20)。番組のエピソードをシャッフルした
// キューを組み、layout常駐のWaveformHeroへ差し替えイベントを送る。
// dispatchEventは同期実行なので、受け手のplay()はこのクリック起点として許容される。
// シャッフルはクリック時にクライアントで行う(ISRページでも毎回違う並びになる)
type Episode = { audioUrl: string; showName: string; title: string; date: string; href: string }

export default function ShowPlayAll({ episodes }: { episodes: Episode[] }) {
  if (episodes.length === 0) return null
  return (
    <button
      type="button"
      className="show-playall"
      onClick={() => {
        const q = [...episodes]
        for (let i = q.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[q[i], q[j]] = [q[j], q[i]]
        }
        window.dispatchEvent(
          new CustomEvent('andy:play-show', { detail: { episodes: q.slice(0, 10) } })
        )
      }}
    >
      この番組を連続再生
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 9 H7 L12 4 V20 L7 15 H3 Z" fill="currentColor" />
      </svg>
    </button>
  )
}
