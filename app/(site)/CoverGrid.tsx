import Link from 'next/link'
import { dateDots, dateShort } from '@/lib/site/text'

export type CoverShow = {
  slug: string
  name: string
  display?: string
  ended?: boolean
  cover: string
  latest: string | null
}

// Podcastカバーのグリッド(Home / /podcast棚 共通)。カバーは番組ページへリンク。
// cover-frame: 白背景ロゴがページの地に溶けないための細枠。
// タイル下は「番組名(Andy指定の表記) + 最新エピソード日付」、
// 終了番組は最終更新がいつの年か分かるよう年入り(2024.02.17)。
export default function CoverGrid({
  heading,
  shows,
}: {
  heading: string
  shows: CoverShow[]
}) {
  return (
    <section className="section">
      <div className="section-head">
        <span>{heading}</span>
      </div>
      <div className="section-body grid4">
        {shows.map((show) => (
          <div key={show.slug}>
            <Link href={`/podcast/${show.slug}`} className="sq cover-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={show.cover} alt={show.name} />
            </Link>
            {show.latest && (
              <div className="cover-label">
                <span className="cover-name">{show.display ?? show.slug.toUpperCase()}</span>
                <span className="latest-date">
                  {show.ended ? dateDots(show.latest) : dateShort(show.latest)}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
