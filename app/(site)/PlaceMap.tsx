import { JAPAN, WORLD, JAPAN_PATH, WORLD_PATH, project, type GeoPoint } from '@/lib/site/geo'

// 場所の地図(2026-07-30 Andy指定)。
// 「宮城県女川町」「北海道白老町」と書かれても分かる人は少ない——初見の人、
// そして海外からの訪問者に、一目で「ここでやっている」と伝えるための図。
//
// サーバーコンポーネント。JSは1バイトも送らず、外部リクエストも増えない。
// 海岸線はlib/site/geo.tsに焼き込んだ静的パス(実行時の計算は座標の投影だけ)。
//
// 彩色しない(サイトの原則)。線は紙の階調、**点だけが黒い**=「ここ」だけが目に入る。
// 点は二重(黒い芯+細い輪)にして、線の集まりの中でも埋もれないようにする。
export default function PlaceMap({
  points,
  view = 'japan',
  width,
  caption,
  link: linked = false,
}: {
  points: GeoPoint[]
  // japan=番組ページ(日本のどこか) / world=About・国を跨ぐ番組(地球のどこか)
  view?: 'japan' | 'world'
  width?: number
  // 図の下に置く小さな見出し(任意)
  caption?: string
  // 2点を弧で結ぶ(BrandShiftの「ニューヨーク ⇄ 東京」=繋いで録っている)。
  // 呼ぶ側が明示する。点の数から推測すると、Aboutの集約地図で日本とNYが
  // たまたま2点に畳まれたときに繋いでしまう(2026-07-30に実際に出た)
  link?: boolean
}) {
  if (points.length === 0) return null
  const m = view === 'world' ? WORLD : JAPAN
  const path = view === 'world' ? WORLD_PATH : JAPAN_PATH
  const w = width ?? (view === 'world' ? 560 : 168)
  const h = Math.round((w * m.h) / m.w)
  // 表示サイズで見分けられない点は1つに畳む(2026-07-30)。
  // 世界地図では白老・北海道・女川・東京が数ピクセルに重なり、輪が団子になっていた。
  // 「地球のどこか」を言う図なので、日本の中の差はここでは要らない
  // (その差は番組ページの日本地図と、Aboutの一覧の「舞台」行が担う)
  const merged: { x: number; y: number }[] = []
  const minGap = (view === 'world' ? 3.4 : 4.6) * 4.4
  for (const p of points.map((q) => project(q, m))) {
    const near = merged.find((q) => Math.hypot(q.x - p.x, q.y - p.y) < minGap)
    if (near) {
      near.x = (near.x + p.x) / 2
      near.y = (near.y + p.y) / 2
    } else {
      merged.push({ ...p })
    }
  }
  const xy = merged

  // 明示指定のときだけ細い弧で結ぶ=「繋いで録っている」
  const link =
    linked && xy.length === 2
      ? `M${xy[0].x} ${xy[0].y}Q${(xy[0].x + xy[1].x) / 2} ${
          Math.min(xy[0].y, xy[1].y) - Math.abs(xy[1].x - xy[0].x) * 0.18
        } ${xy[1].x} ${xy[1].y}`
      : null

  // 点の大きさは図の大きさに従わせる(世界地図では小さく、日本地図では大きく)
  const r = view === 'world' ? 3.4 : 4.6

  return (
    <figure className={`place-map ${view}`} style={{ width: w }}>
      <svg
        viewBox={`0 0 ${m.w} ${m.h}`}
        width={w}
        height={h}
        role="img"
        aria-label={caption ? `地図: ${caption}` : '地図'}
      >
        <path
          d={path}
          fill="none"
          stroke="var(--faint)"
          strokeWidth={view === 'world' ? 1 : 1.3}
          strokeLinejoin="round"
        />
        {link && (
          <path d={link} fill="none" stroke="var(--dot)" strokeWidth={0.9} strokeDasharray="3 3" />
        )}
        {xy.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={r * 2.4} fill="none" stroke="var(--faint)" strokeWidth={0.9} />
            <circle cx={p.x} cy={p.y} r={r} fill="var(--ink)" />
          </g>
        ))}
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}
