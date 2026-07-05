// Podcast番組カタログ(handoff-notes §2・§5)。
// フィードは全番組Anchor RSS(2026-07-05 Andy指定。LISTENは使わない)。
// カバー・最新日付・エピソードはすべてRSSから自動取得(lib/site/podcastFeed.ts)。
// feed未設定・取得失敗の番組は表示しない(プレースホルダ禁止)。
export type Show = {
  slug: string
  name: string
  display?: string // タイル下の表記(Andy直接指定)。未指定の番組は配信開始時に指定をもらう
  ended?: boolean // 終了番組: 最終更新日を年入り(2024.02.17)で表示する
  group: 'original' | 'works'
  feed?: string
  // 番組ページのROLE(担当領域の列挙、旧サイト移植)。文言はAndyから。未設定なら非表示
  role?: string
}

export const SHOWS: Show[] = [
  {
    slug: 'sakanakaigi',
    name: 'サカナカイギ',
    display: 'SAKANAKAIGI',
    group: 'original',
    feed: 'https://anchor.fm/s/1039cb824/podcast/rss',
  },
  {
    slug: 'mimoriradio',
    name: 'ミモリラジオ',
    display: 'MIMORIRADIO',
    ended: true, // 終了番組(最終更新を年入りで表示)
    group: 'original',
    feed: 'https://anchor.fm/s/ccd5236c/podcast/rss',
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
  },
  {
    slug: 'onairdo',
    name: 'ON-AIRDO 声で旅する北海道',
    display: 'ON-AIRDO',
    group: 'works',
    feed: 'https://anchor.fm/s/fe6f8048/podcast/rss',
  },
  {
    slug: 'brandshift',
    name: 'Brand Shift',
    display: 'BRANDSHIFT',
    group: 'works',
    feed: 'https://anchor.fm/s/10f799928/podcast/rss',
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
