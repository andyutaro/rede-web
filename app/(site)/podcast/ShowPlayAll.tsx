'use client'

// 「作業用まとめ聞き」(2026-08-01改、旧「この番組を連続再生」)。
// 旧版はシャッフルした10本のキューを組んでいたが、作業中にまとめて聴く使い方では
// ランダムはノイズになり、10本の頭打ちも邪魔になる(Andy)。
// - 並び替えをやめ、渡された順(=古い回から新しい回へ)のまま流す。
//   「#1から」「前に聴いた#7の続きから」という追いつき方をそのまま満たす向き
// - 本数の上限も置かない。番組まるごとをキューにする(点列は現在地の周りだけを
//   窓で見せるので、長さが増えても再生中の表示は崩れない)
// 起点は置かれた場所が決める: 番組ページ=第1回から、エピソードページ=その回から。
// layout常駐のWaveformHeroへキュー差し替えイベントを送る。dispatchEventは同期実行
// なので、受け手のplay()はこのクリック起点として許容される。
type Episode = { audioUrl: string; showName: string; title: string; date: string; href: string }

export default function ShowPlayAll({
  episodes,
  label = '作業用まとめ聞き',
}: {
  episodes: Episode[]
  label?: string
}) {
  if (episodes.length === 0) return null
  return (
    <button
      type="button"
      className="show-playall"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent('andy:play-show', {
            // fromStart: 頭から鳴らす。全番組キュー(PODCASTピル)の「放送に途中から
            // 合流する」10:00シークは、狙って選んだ回には掛けない
            detail: { episodes, fromStart: true },
          })
        )
      }}
    >
      {label}
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 9 H7 L12 4 V20 L7 15 H3 Z" fill="currentColor" />
      </svg>
    </button>
  )
}
