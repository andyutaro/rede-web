// 番組カバーアートと最新エピソード日付をRSSから自動取得する(手動入稿はしない)。
// カバーは「番組全体」のアート(チャンネルレベルの<itunes:image>)であって、
// エピソード個別の画像ではない。そのためXMLの<item>より前(=channel部分)だけを見る。
// 最新日付は先頭<item>の<pubDate>(RSSは新しい順が慣例。LISTEN/Anchorとも準拠)。
//
// RSSは外部由来文字列なので、URLとして採用するのはhttps:のみ
// (表示側はReactの属性エスケープを通る)。

export type ChannelInfo = {
  image: string | null
  latest: string | null // YYYY-MM-DD (東京)
}

const TTL_MS = 24 * 60 * 60 * 1000

// サーバーインスタンス内のメモリキャッシュ。LISTENのRSSは文字起こし込みで
// 大きくなり得るため、リクエストごとの再取得を避ける(Nextのデータキャッシュ併用)。
const cache = new Map<string, { info: ChannelInfo; ts: number }>()

export async function channelInfo(feedUrl: string): Promise<ChannelInfo> {
  const hit = cache.get(feedUrl)
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.info

  const info: ChannelInfo = { image: null, latest: null }
  try {
    const res = await fetch(feedUrl, { next: { revalidate: 86400 } })
    if (res.ok) {
      const xml = await res.text()
      const [head, firstItem = ''] = xml.split(/<item[\s>]/i)

      const img =
        head.match(/<itunes:image[^>]*\bhref\s*=\s*["']([^"']+)["']/i) ??
        head.match(/<image>[\s\S]*?<url>\s*([^<\s]+)\s*<\/url>/i)
      if (img && /^https:\/\//i.test(img[1])) info.image = img[1]

      const pd = firstItem.match(/<pubDate>\s*([^<]+?)\s*<\/pubDate>/i)
      if (pd) {
        const d = new Date(pd[1])
        if (!Number.isNaN(d.getTime())) {
          info.latest = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(d)
        }
      }
    }
  } catch {
    // フィード到達不可: カバーなし扱い(セクション側で非表示になる)
  }
  cache.set(feedUrl, { info, ts: Date.now() })
  return info
}
