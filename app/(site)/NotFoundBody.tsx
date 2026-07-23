import Link from 'next/link'

// 404の中身(2026-07-23)。2箇所から使う:
// - app/(site)/not-found.tsx : notFound()を投げた頁(存在しないエピソード・scribeの日付)
// - app/not-found.tsx        : どのルートにも当たらないURL
// 借り物の英語画面をやめ、棚見出し+短い一文+行き先だけの静かな頁にする。
export default function NotFoundBody() {
  return (
    <div className="measure">
      <section className="section">
        <div className="section-head">
          <span>NOT FOUND</span>
        </div>
        <div className="section-body nf-body">
          <p className="nf-line">その頁は見つかりませんでした。</p>
          <p className="nf-sub">場所が変わったか、もう無いのだと思います。</p>
          <div className="nf-links">
            <Link href="/">Home へ →</Link>
            <Link href="/podcast">Podcast へ →</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
