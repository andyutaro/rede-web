import { DEFAULT_DESK_PREAMBLE, type DeskPreambleContent } from '@/lib/site/pages'

// deskの位置づけ文(handoff-notes §11)。確定アーカイブだけでなく当日の生放送にも置く
// (2026-08-07 Andy指定): /liveに直接来た人にも、これが何なのかが分かるようにする。
//
// 全幅に流すと「横にだらっと広がる」ため、行を設計した短い銘文として組む
// (2026-07-19 Andy指摘)。行はさらに意味の切れ目で分節してあり、
// 折り返しが起きる狭い画面では分節がそのまま改行になる(=途中で切れてギクシャクしない)。
//
// 文言はstudioから編集できる(2026-10-15)。**この部品は自分では読みに行かない**
// ——/liveはクライアント部品(LiveFull)の中で描かれるため、読むのはサーバー側の
// ページの仕事にして、ここは渡された文字を組むことに徹する。
export default function DeskPreamble({
  variant,
  content = DEFAULT_DESK_PREAMBLE,
}: {
  variant: 'live' | 'archive'
  content?: DeskPreambleContent
}) {
  const closing = variant === 'live' ? content.live : content.archive
  const lines = closing ? [...content.lines, [closing]] : content.lines
  return (
    <p className="scribe-preamble">
      {lines.map((segments, i) => (
        <span key={`${i}-${segments.join('')}`}>
          {segments.map((s, j) => (
            <span key={`${j}-${s}`}>{s}</span>
          ))}
        </span>
      ))}
    </p>
  )
}
