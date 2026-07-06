// Podcast番組カタログ(handoff-notes §2・§5)。
// フィードは全番組Anchor RSS(2026-07-05 Andy指定。LISTENは使わない)。
// カバー・最新日付・エピソードはすべてRSSから自動取得(lib/site/podcastFeed.ts)。
// feed未設定・取得失敗の番組は表示しない(プレースホルダ禁止)。
// 番組の配信先(番組単位のリスニングページ)。RSSにはエピソード単位のリンクが
// 無いため番組単位で持つ。設定された分だけボタンを出す(番組ごとに配信先が違う)。
// エピソード個別の再生はネイティブプレイヤー(enclosure)が担う。
export type Platforms = {
  spotify?: string
  apple?: string
  amazon?: string
  listen?: string
}

export type Show = {
  slug: string
  name: string
  display?: string // タイル下の表記(Andy直接指定)。未指定の番組は配信開始時に指定をもらう
  ended?: boolean // 終了番組: 最終更新日を年入り(2024.02.17)で表示する
  group: 'original' | 'works'
  feed?: string
  // この日付(東京)より前のエピソードを取り込まない。同じAnchor枠で旧番組が
  // 配信されていた場合の混入除去(BrandShift新シリーズは2026-03-10以降)。
  since?: string
  // 番組ページのROLE(担当領域の列挙、旧サイト移植)。文言はAndyから。未設定なら非表示
  role?: string
  platforms?: Platforms
}

export const SHOWS: Show[] = [
  {
    slug: 'sakanakaigi',
    name: 'サカナカイギ',
    display: 'SAKANAKAIGI',
    group: 'original',
    feed: 'https://anchor.fm/s/1039cb824/podcast/rss',
    platforms: {
      spotify: 'https://open.spotify.com/show/2oyDL4w0U7hRmwIFRC7jDK',
      apple: 'https://podcasts.apple.com/jp/podcast/id1811565002',
      listen: 'https://listen.style/p/sakanakaigi',
    },
  },
  {
    slug: 'mimoriradio',
    name: 'ミモリラジオ',
    display: 'MIMORIRADIO',
    ended: true, // 終了番組(最終更新を年入りで表示)
    group: 'original',
    feed: 'https://anchor.fm/s/ccd5236c/podcast/rss',
    platforms: {
      spotify: 'https://open.spotify.com/show/0rkdfNkYUCfMyQmki7fdc1',
      apple: 'https://podcasts.apple.com/jp/podcast/id1654874149',
      listen: 'https://listen.style/p/mimoriradio',
    },
  },
  {
    slug: 'gairon',
    name: 'ガイロン',
    group: 'original',
    // 配信未開始(2026-07-05時点)。開始したらフィードURLをここに足す
  },
  {
    slug: 'longpost',
    name: 'ロングポスト',
    display: 'LONGPOST',
    group: 'original',
    feed: 'https://anchor.fm/s/f20aee28/podcast/rss',
    platforms: {
      spotify: 'https://open.spotify.com/show/34phiuFlCBcfscYLP5iCyb',
      apple: 'https://podcasts.apple.com/jp/podcast/id1734760147',
      listen: 'https://listen.style/p/longpost',
    },
  },
  {
    slug: 'onairdo',
    name: 'ON-AIRDO 声で旅する北海道',
    display: 'ON-AIRDO',
    group: 'works',
    feed: 'https://anchor.fm/s/fe6f8048/podcast/rss',
    role: 'ディレクター兼サブMCとして、出演を含め番組制作上のほぼ全てに立ち上げから対応。',
    platforms: {
      spotify: 'https://open.spotify.com/show/1EjsDlGdwwEDc1xsNxpEAP',
      apple: 'https://podcasts.apple.com/jp/podcast/id1784693396',
    },
  },
  {
    slug: 'brandshift',
    name: 'Brand Shift',
    display: 'BRANDSHIFT',
    group: 'works',
    feed: 'https://anchor.fm/s/10f799928/podcast/rss',
    // 同じAnchor枠で旧番組が#158まで配信されていたため、新シリーズ#001以降のみ取り込む
    since: '2026-03-10',
    role: 'ディレクターとしてChronicleチームに参画し立ち上げから対応。',
    platforms: {
      spotify: 'https://open.spotify.com/show/53kqwZLMXYHUaPH8X7UFev',
      apple: 'https://podcasts.apple.com/jp/podcast/id1648834007',
    },
  },
  {
    slug: 'altfishing',
    name: 'オルタナティブフィッシング',
    group: 'works',
    // 配信未開始(2026-07-05時点)。開始したらフィードURLをここに足す
  },
]

export function showBySlug(slug: string): Show | undefined {
  return SHOWS.find((s) => s.slug === slug)
}
