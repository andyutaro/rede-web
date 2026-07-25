// 番組ヘッダー背後に沈める映像(2026-07-25。サカナカイギ=イワシ、ミモリ=サクラマス滝、
// ロングポスト=白老の浜、ON-AIRDO=機窓の雲海)。シームレスループ動画を暗く沈めた層。
// z-index:-2でグローバル波形(fixed z:-1)より背後に置く=波形が水の中を泳ぐ。
// ポスター画像を背景にも敷き、「動きを減らす」設定の人には映像を消して
// ポスター静止画だけを見せる(site.css)。音声は落としてある。
// カバータイルには干渉しない(この層はヘッダー全体の背後)。
export default function ShowHeroWater({ base }: { base: string }) {
  return (
    <div
      className="hero-water"
      aria-hidden="true"
      style={{ backgroundImage: `url(${base}.jpg)` }}
    >
      <video
        className="hero-water-video"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster={`${base}.jpg`}
      >
        <source src={`${base}.mp4`} type="video/mp4" />
      </video>
      <div className="hero-water-veil" />
    </div>
  )
}
