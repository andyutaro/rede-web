// Podcast番組カタログ(handoff-notes §2・§5)。
// カバーアートはfeed(RSS)のチャンネル画像から自動取得(lib/site/podcastCovers.ts)。
// feed未設定・取得失敗の番組は表示しない(プレースホルダ禁止)。
// latest(LATEST日付)はRSS取り込み本体(フェーズ3)で自動化するまで未設定。
export type Show = {
  slug: string
  name: string
  display?: string // タイル下の表記(Andy直接指定)。未指定の番組は配信開始時に指定をもらう
  ended?: boolean // 終了番組: 最終更新日を年入り(2026.02.17)で表示する
  group: 'original' | 'works'
  feed?: string
  latest?: string // YYYY-MM-DD
}

export const SHOWS: Show[] = [
  {
    slug: 'sakanakaigi',
    name: 'サカナカイギ',
    display: 'SAKANAKAIGI',
    group: 'original',
    feed: 'https://listen.style/p/sakanakaigi/rss',
  },
  {
    slug: 'mimoriradio',
    name: 'ミモリラジオ',
    display: 'MIMORIRADIO',
    ended: true, // 終了番組(最終更新を年入りで表示)
    group: 'original',
    feed: 'https://listen.style/p/mimoriradio/rss',
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
    feed: 'https://listen.style/p/longpost/rss',
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
