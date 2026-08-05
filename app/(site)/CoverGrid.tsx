import Link from 'next/link'
import { dateShort } from '@/lib/site/text'
import { imgThumb, IMG_W } from '@/lib/site/img'

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
// タイル下は「番組名(Andy指定の表記) + 最新エピソード日付」。
// 昨年以前の日付はdateShortの規則(2026-07-10)が自動で年入りにする(終了番組もこれで賄う)。
//
// onAirSince: この日付以降に更新された番組は日付がON AIR表示になる(2026-08-05 Andy
// 「三日以内に更新されている番組は、その日付にエフェクトと色と小さな動きを。
// humbleな範囲での遊び心」)。境界の計算はページ側でtokyoDaysAgo(3)を渡す
// =Date.now()をrenderに持ち込まない(text.tsの規約、EpisodeIndex等と同じ形)。
// 既定は'9999-12-31'=渡さなければ誰も光らない。
export default function CoverGrid({
  heading,
  shows,
  onAirSince = '9999-12-31',
}: {
  heading: string
  shows: CoverShow[]
  onAirSince?: string
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{heading}</h2>
      </div>
      <div className="section-body grid4">
        {shows.map((show) => (
          <div key={show.slug}>
            <Link href={`/podcast/${show.slug}`} className="sq cover-frame">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* カバーはファーストビュー相当なのでeager(lazyだとLCPが遅れる)。1枚10-60KBに変換済み */}
              <img src={imgThumb(show.cover, IMG_W.tile)} alt={show.name} decoding="async" />
            </Link>
            {show.latest && (
              <div className="cover-label">
                <span className="cover-name">{show.display ?? show.slug.toUpperCase()}</span>
                {/* 新着マークは既存の.new-dot(エピソード一覧の7日以内)をそのまま使い回し、
                    ON AIR版はランプの滲みと呼吸だけを足す=新しい形を増やさない */}
                <span className={`latest-date${show.latest >= onAirSince ? ' on-air' : ''}`}>
                  {dateShort(show.latest)}
                  {show.latest >= onAirSince && (
                    <span className="new-dot on-air-lamp" aria-label="最近更新" />
                  )}
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
