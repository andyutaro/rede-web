// 波形のローダー本体(2026-09-10、元は app/(site)/loading.tsx)。
//
// **サイト全体を包むのをやめた理由**: (site)直下にloading.tsxがあると、全ページが
// Suspenseの内側に入り、描画の最初にフォールバックがストリーミングされる。
// その時点でステータス200が確定するので、存在しないエピソード・日付・記事で
// notFound()しても本当の404を返せず、noindexを差し込むことしかできなかった
// (Next.jsの仕様。実測: 外すと404、残すと200)。
//
// そこで「可変の子(/[id]等)を持たないフォルダ」にだけ、各々のloading.tsxから
// これを置く。可変の子を持つフォルダ(desk/notes/photography/physical/podcast)と
// Homeには置かない——置くと子の詳細ページまで包んで、また200に戻る。

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
