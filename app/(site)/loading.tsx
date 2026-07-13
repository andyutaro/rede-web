// ルート遷移・初期描画待ちのローディング(2026-07-13)。音声波形チックな見た目に。
// 中央基準で高さがバラつくバー群(実際のオーディオ波形の包絡線)が、少しずつ位相をずらして
// 上下に脈打つ。アニメはCSSのみ(server component)。
// 各バーの基準高さ(波形の起伏)をインラインで与え、CSSがscaleYで揺らす。
const BARS = [
  0.28, 0.5, 0.38, 0.72, 0.55, 0.9, 0.62, 1, 0.7, 0.85, 0.45, 0.68, 0.34, 0.56, 0.4, 0.6, 0.3,
]

export default function Loading() {
  return (
    <div className="site-loading" role="status" aria-label="読み込み中">
      <div className="loading-wave" aria-hidden="true">
        {BARS.map((h, i) => (
          <span
            key={i}
            style={{ height: `${Math.round(h * 100)}%`, animationDelay: `${i * 0.07}s` }}
          />
        ))}
      </div>
    </div>
  )
}
