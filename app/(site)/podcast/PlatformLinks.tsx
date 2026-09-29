import type { Platforms } from '@/lib/site/shows'

// 番組の配信先へ送客するボタン群。設定された配信先だけを一定の順序で並べる。
// リンク先は番組単位(RSSにエピソード単位のリンクが無いため)。
// Amazon Musicは掲載しない(2026-07-11 Andy決定)
// 表記は短く(2026-09-29 Andy決定)。スマホでは3つを横1段の等分割に並べるので、
// セルに入る長さが上限になる。'Apple Podcasts'はSpotify・LISTENと並ぶ文脈なので
// 'Apple'でも指す先は変わらない
const ORDER: { key: keyof Platforms; label: string }[] = [
  { key: 'spotify', label: 'Spotify' },
  { key: 'apple', label: 'Apple' },
  { key: 'listen', label: 'LISTEN' },
]

export default function PlatformLinks({ platforms }: { platforms?: Platforms }) {
  if (!platforms) return null
  const items = ORDER.filter((o) => platforms[o.key])
  if (items.length === 0) return null

  return (
    <div className="platform-links">
      {items.map((o) => (
        <a
          key={o.key}
          href={platforms[o.key]}
          target="_blank"
          rel="noopener noreferrer"
          className="platform-btn"
        >
          {o.label} →
        </a>
      ))}
    </div>
  )
}
