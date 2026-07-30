// Podcast番組カタログ(handoff-notes §2・§5)。
// フィードは全番組Anchor RSS(2026-07-05 Andy指定。LISTENは使わない)。
// カバー・最新日付・エピソードはすべてRSSから自動取得(lib/site/podcastFeed.ts)。
// feed未設定・取得失敗の番組は表示しない(プレースホルダ禁止)。
// 番組の配信先(番組単位のリスニングページ)。RSSにはエピソード単位のリンクが
// 無いため番組単位で持つ。設定された分だけボタンを出す(番組ごとに配信先が違う)。
// エピソード個別の再生はネイティブプレイヤー(enclosure)が担う。
// Amazon Musicは掲載しない(2026-07-11 Andy決定)
export type Platforms = {
  spotify?: string
  apple?: string
  listen?: string
}

// 番組の舞台(2026-07-25 Andy指定)。各地に根ざして制作されていることが
// Andyのユニークネスであり、番組ページとAboutに記す。
//
// 2026-07-30に地図へ移行。「女川」「白老」と書かれても分かる人は少なく、
// フィジカルを入口に海外から来る可能性もある。座標の活字(38°27′N…)は
// **地図が同じことをより直感的に言うので落とした**——冗長を残さない。
// 代わりに英語表記を持たせる(初見・海外向けの最短の答え)。
export type ShowPlace = {
  ja: string // 宮城県女川町
  en: string // Onagawa, Miyagi, Japan
  // 地図に打つ点。BrandShiftのように国を跨ぐ番組は2点(細い弧で結ばれる)。
  // labelはAboutの集約地図に添える短い地名(2026-07-30 Andy「東京・宮城・北海道・
  // 白老町がわかりにくいのが勿体無い」)。番組ページは下に地名を書くので使わない。
  // labelSideは名前を出す向き。白老と北海道中央は近いので、白老だけ西(左)へ逃がす
  points: { lat: number; lon: number; label?: string; labelSide?: 'left' | 'right' }[]
  // 世界地図で見せる番組(国を跨ぐもの)。既定は日本地図
  view?: 'japan' | 'world'
  note?: string // BrandShift: ビデオ通話で繋いで収録
}

// 番組の出演者(2026-07-29 Andy)。番組名で検索して来た人の最初の問いは
// 「誰の声か」なのに、ページに人が一人も出ていなかった。識別部の銘板の下に
// 名前と担当だけを置く。写真は持ち込まない(本人の肖像を番組側で決めない)。
// hrefは本人が公開しているアカウント等。無ければ名前は素のまま出る
export type ShowCastMember = {
  name: string
  role: string // アングラー / 漁師 / プロデュース・ディレクション・編集・出演
  href?: string
}

export type Show = {
  slug: string
  name: string
  // Updates等で「◯◯配信」と使う自然な番組名(サブタイトルなし)。未指定ならnameを使う。
  shortName?: string
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
  // おたよりの宛先項目(2026-07-20 Andy指定)。設定された番組は宛先選択が
  // 「番組名 / 項目」の複数択になる(参考: 複数番組ポッドキャストグループの宛先UI)。
  // 未設定の番組は番組名そのものが1つの宛先
  otayoriTopics?: string[]
  // 番組専用の外部おたよりフォーム(2026-07-20 Andy指定、ON-AIRDO=Google Form)。
  // 設定された番組はエピソード・番組ページからこのURLへ遷移させる
  // (サイト内のおたよりフォームには載せない=宛先はオリジナル番組のみの原則は不変)
  otayoriUrl?: string
  // 番組ページのヘッダー背後に沈める映像(2026-07-25 Andy)。
  // 拡張子なしのベースパス(.mp4/.jpg を付けて使う)。番組ごとにページが分岐する方針の一環。
  // 映像はシームレスループ必須(末尾を先頭にクロスフェード。手順はSITE-STATUS.md)。
  // ※「彩色はLIVE赤のみ」を番組ページ群だけ曲げる、Andy承認の意図的な例外
  heroVideo?: string
  // 番組の舞台(番組ページの識別部とAboutのPLACES節に出す)
  place?: ShowPlace
  // 出演者(番組ページの識別部。並び順のまま出す)
  cast?: ShowCastMember[]
  // 番組の言葉(2026-07-29 Andy)。RSSのchannel説明はアコーディオンに畳まれていて
  // 番組が何であるかが最初に出てこない。Andy自身の過去の文章を短く畳んだ紹介を
  // 識別部の頭に置く。改行はそのまま出す(white-space: pre-line)
  intro?: string
  // 番組から派生して制作されたプロダクト(2026-07-25 Andy指定)。
  // articles(type=physical)のIDを、この並び順のまま出す
  products?: string[]
  // その番組の催し(2026-07-29 Andy)。articles(type=event)のIDを、この並び順のまま出す。
  // 番組の「今」は番組の家にあるべき、という判断
  events?: string[]
  // ※productsとeventsは番組ページの EXPANSION 節に一続きで並ぶ(物→催しの順)。
  //   「番組から生まれたもの」という一つの事実なので節は分けない(2026-07-29 Andy)
}

export const SHOWS: Show[] = [
  {
    slug: 'sakanakaigi',
    name: 'サカナカイギ',
    display: 'SAKANAKAIGI',
    group: 'original',
    feed: 'https://anchor.fm/s/1039cb824/podcast/rss',
    heroVideo: '/bg/sakanakaigi-school',
    place: {
      ja: '宮城県女川町',
      en: 'Onagawa, Miyagi, Japan',
      points: [{ lat: 38.446, lon: 141.446, label: '宮城' }],
      // 制作の実態(2026-07-29 Andy)。舞台が遠いことは番組の性質そのもの
      note: '1ヶ月に一度、通って収録',
    },
    // 番組の言葉(2026-07-29): Andy本人の文章をそのまま置く
    intro:
      '宮城県女川産・即興サカナトーク🐠🐡🐟\n' +
      'アングラー(釣り人)・漁師などサカナな人が集まって、肴をつまみ呑みながらトークする台本なしのオリジナル番組です',
    // 出演者(2026-07-29 Andy)。担当は肩書き一語に揃える(制作側の列挙は
    // 押し付けがましくなる、というAndyの指摘)
    cast: [
      { name: 'Andy', role: 'ポッドキャスター', href: 'https://www.instagram.com/andyutaro/' },
      { name: 'ユウスケ', role: 'アングラー', href: 'https://www.instagram.com/yusuke_shore.ltd/' },
      { name: 'リュウタ', role: '漁師', href: 'https://www.instagram.com/suzuryu0721/' },
    ],
    // MADNESSタイアップルアー(2026-07-25 Andy指定)
    products: ['00d06869-b0b8-40b3-a06b-0dbf8d7ef145'],
    // 女川で開いてきた催し(2026-07-29、Instagramの投稿から取り込み)。新しい順
    events: [
      '984c777d-9fd5-42fa-ab78-cfd6a67330b2', // ニツケカイギ 2026-03-04
      'a2564cd3-d3ca-46a6-be2d-051632ef9a48', // オナベカイギ 2025-12-17
      '768b5de1-5447-4429-8993-3efe686b8455', // Inspiring Voice 2025-11-28
      '4a1d4f91-2f8b-4d5d-9c0e-33cbe6f8942b', // フライカイギ 2025-08-22
      '2c90bc28-0e01-49f7-8686-9b16449acd26', // オスシカイギ 2025-05-29
    ],
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
    // サクラマスが滝を跳ぶ(2026-07-25 Andy素材)
    heroVideo: '/bg/mimoriradio-falls',
    place: {
      ja: '北海道白老町',
      en: 'Shiraoi, Hokkaido, Japan',
      points: [{ lat: 42.533, lon: 141.35, label: '白老', labelSide: 'left' }],
    },
    // Ecce Planta / mimori Herbal Bathsalt / ZINE(2026-07-25 Andy指定の3つ)
    products: [
      'ed4d2a90-4f1d-47f8-99a7-7a4f4e4c9693',
      '155be65e-e074-4b75-9160-9cf8d9bacaba',
      'ee33af5d-b1e6-4fb7-8db8-acbbd8c0faee',
    ],
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
    // 夕暮れの白老の浜(2026-07-25 Andy素材)
    heroVideo: '/bg/longpost-sea',
    place: {
      ja: '北海道白老町',
      en: 'Shiraoi, Hokkaido, Japan',
      points: [{ lat: 42.533, lon: 141.35, label: '白老', labelSide: 'left' }],
    },
    // おたより項目(2026-07-20 Andy指定の3つ)
    otayoriTopics: ['制作', '生活', 'ポッドキャストをやっててよかったこと'],
    platforms: {
      spotify: 'https://open.spotify.com/show/34phiuFlCBcfscYLP5iCyb',
      apple: 'https://podcasts.apple.com/jp/podcast/id1734760147',
      listen: 'https://listen.style/p/longpost',
    },
  },
  {
    slug: 'onairdo',
    name: 'ON-AIRDO 声で旅する北海道',
    shortName: 'ON-AIRDO',
    display: 'ON-AIRDO',
    group: 'works',
    feed: 'https://anchor.fm/s/fe6f8048/podcast/rss',
    // 機窓の雲海(2026-07-25 Andy素材。縦動画から反射光を避けて16:9切出し)
    heroVideo: '/bg/onairdo-flight',
    // 「声で旅する北海道」=島全体が舞台なので座標は丸める
    place: {
      ja: '北海道',
      en: 'Hokkaido, Japan',
      points: [{ lat: 43.2, lon: 142.4, label: '北海道' }],
    },
    role: 'ディレクター兼サブMCとして、出演を含め番組制作上のほぼ全てに立ち上げから対応。',
    // 番組専用のおたよりフォーム(Google Form、2026-07-20 Andy指定)
    otayoriUrl:
      'https://docs.google.com/forms/d/e/1FAIpQLSfO1WRlugESfEYprczMrCjO2wEAku4X6zjVRS3pk9urPwg16g/viewform',
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
    place: {
      ja: 'ニューヨーク ⇄ 東京',
      en: 'New York ⇄ Tokyo',
      points: [
        { lat: 40.713, lon: -74.006, label: 'ニューヨーク' },
        { lat: 35.689, lon: 139.692, label: '東京' },
      ],
      view: 'world',
      note: 'ビデオ通話で繋いで収録',
    },
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

// おたよりを受け付ける番組(2026-07-20): オリジナルかつ配信中かつ継続中。
// 終了番組(ミモリラジオ等)は送られても応えられないため宛先から外す
export function otayoriShows(): Show[] {
  return SHOWS.filter((s) => s.group === 'original' && s.feed && !s.ended)
}

// 項目を持たない番組の唯一の宛先項目(2026-07-25 Andy指定)。
// フォームの見た目を全番組【 番組名 】+項目の同じ形に揃えるための既定項目
export const DEFAULT_OTAYORI_TOPIC = '自由おたより'

export function otayoriTopicsOf(s: Show): string[] {
  return s.otayoriTopics?.length ? s.otayoriTopics : [DEFAULT_OTAYORI_TOPIC]
}

// おたよりの宛先ラベル一覧。フォームの選択肢とAPI検証(/api/contact)が
// 必ず同じ集合を見るための単一の出所。全番組「番組名 / 項目」に展開
// (項目なし番組は既定の「自由おたより」1つ)
export function otayoriLabels(): string[] {
  return otayoriShows().flatMap((s) => {
    const name = s.shortName ?? s.name
    return otayoriTopicsOf(s).map((t) => `${name} / ${t}`)
  })
}
