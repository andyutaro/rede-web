import { JAPAN, WORLD, JAPAN_PATH, WORLD_PATH, project, type GeoPoint } from '@/lib/site/geo'

// 場所の地図(2026-07-30 Andy指定)。
// 「宮城県女川町」「北海道白老町」と書かれても分かる人は少ない——初見の人、
// そして海外からの訪問者に、一目で「ここでやっている」と伝えるための図。
//
// サーバーコンポーネント。JSは1バイトも送らず、外部リクエストも増えない。
// 海岸線はlib/site/geo.tsに焼き込んだ静的パス(実行時の計算は座標の投影だけ)。
//
// 点はLIVEの赤で明滅させる(2026-07-30 Andy指定)。サイトの彩色は「LIVE赤のみ」で、
// この赤は「いま生きているものがそこにある」という一貫した意味を持つ——
// 収録が今も続いている土地に同じ赤を打つのは、その語彙の正しい延長。
// 明滅は2.8秒周期・波紋つきで、当日scribeのLIVEセルと同一(site.css)。
export default function PlaceMap({
  points,
  view = 'japan',
  width,
  caption,
  link: linked = false,
  labels = false,
}: {
  points: GeoPoint[]
  // japan=番組ページ(日本のどこか) / world=国を跨ぐ番組(地球のどこか)
  view?: 'japan' | 'world'
  width?: number
  // 図の下に置く小さな見出し(任意)
  caption?: string
  // 2点を弧で結ぶ(BrandShiftの「ニューヨーク ⇄ 東京」=繋いで録っている)。
  // 呼ぶ側が明示する。点の数から推測すると、Aboutの集約地図で日本とNYが
  // たまたま2点に畳まれたときに繋いでしまう(2026-07-30に実際に出た)
  link?: boolean
  // 点の横に地名を添える(Aboutの集約地図。番組ページは下に地名を書くので不要)
  labels?: boolean
}) {
  if (points.length === 0) return null
  const m = view === 'world' ? WORLD : JAPAN
  const path = view === 'world' ? WORLD_PATH : JAPAN_PATH
  const w = width ?? (view === 'world' ? 560 : 168)
  const h = Math.round((w * m.h) / m.w)
  // 点の大きさは図の大きさに従わせる(世界地図では小さく、日本地図では大きく)
  const r = view === 'world' ? 3.4 : 4.6

  // 表示サイズで見分けられない点は1つに畳む(2026-07-30)。
  // 世界地図では白老・北海道・女川・東京が数ピクセルに重なり、輪が団子になっていた。
  // 畳んだ点の名前は先に来たものを残す(白老と北海道はどちらも「北海道」)
  const merged: { x: number; y: number; label?: string; labelSide?: 'left' | 'right' }[] = []
  const minGap = r * 4.4
  for (const p of points) {
    const xy = project(p, m)
    // 同じ名前の点は距離に関係なく1つにする(2026-07-30)。白老と北海道中央は
    // 日本地図では25px離れていて畳まれず、「北海道」が2つ並んで出た
    const near =
      merged.find((q) => p.label != null && q.label === p.label) ??
      merged.find((q) => Math.hypot(q.x - xy.x, q.y - xy.y) < minGap)
    if (near) {
      near.x = (near.x + xy.x) / 2
      near.y = (near.y + xy.y) / 2
      near.label = near.label ?? p.label
      near.labelSide = near.labelSide ?? p.labelSide
    } else {
      merged.push({ ...xy, label: p.label, labelSide: p.labelSide })
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
            {/* 波紋 → 輪 → 芯 の順に重ねる(芯が一番前) */}
            <circle className="pm-ripple" cx={p.x} cy={p.y} r={r} />
            <circle className="pm-ring" cx={p.x} cy={p.y} r={r * 2.2} />
            <circle className="pm-core" cx={p.x} cy={p.y} r={r} />
            {labels && p.label && (
              // 近い点同士で名前が衝突するときは向きを逃がす(白老と北海道中央)
              <text
                className="pm-label"
                x={p.labelSide === 'left' ? p.x - r * 3.2 : p.x + r * 3.2}
                y={p.y + r * 0.9}
                textAnchor={p.labelSide === 'left' ? 'end' : 'start'}
              >
                {p.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}
