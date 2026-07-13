// ルート遷移・初期描画待ちのローディング(2026-07-13)。サイトの波形モチーフに準拠した
// 静かなイコライザ(細い縦バーが順に脈打つ)。アニメはCSSのみ(server component)。
export default function Loading() {
  return (
    <div className="site-loading" role="status" aria-label="読み込み中">
      <div className="loading-wave" aria-hidden="true">
        {Array.from({ length: 7 }).map((_, i) => (
          <span key={i} style={{ animationDelay: `${i * 0.1}s` }} />
        ))}
      </div>
    </div>
  )
}
