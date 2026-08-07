// deskの位置づけ文(handoff-notes §11)。確定アーカイブだけでなく当日の生放送にも置く
// (2026-08-07 Andy指定): /liveに直接来た人にも、これが何なのかが分かるようにする。
//
// 全幅に流すと「横にだらっと広がる」ため、行を設計した短い銘文として組む
// (2026-07-19 Andy指摘)。行はさらに意味の切れ目で分節してあり、
// 折り返しが起きる狭い画面では分節がそのまま改行になる(=途中で切れてギクシャクしない)。
const LINES: string[][] = [
  ['desk — 読むポッドキャスト。'],
  ['日々の考え事やつぶやきを生放送で書き、', '一日が終わると確定テキストになります。'],
]

// 締めの一行だけが場面で変わる: 今日は生放送、過ぎた日はアーカイブ
const CLOSING = {
  live: 'これは今日の生放送。',
  archive: 'これはそのアーカイブ。',
} as const

export default function DeskPreamble({ variant }: { variant: keyof typeof CLOSING }) {
  return (
    <p className="scribe-preamble">
      {[...LINES, [CLOSING[variant]]].map((segments) => (
        <span key={segments.join('')}>
          {segments.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </span>
      ))}
    </p>
  )
}
