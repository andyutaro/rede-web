import { cachedJson } from '@/lib/site/edgeCache'
import { SHOWS } from './shows'
import { fetchShowFeed } from './podcastFeed'
import { HOKKAIDO_PLACES } from './hokkaidoPlaces'

// エピソード横断検索(2026-08-23 Andy指定)。MENUの中の検索が使う。
//
// 「あの話どの回だっけ」を解くのが目的なので、題名だけでなく**概要欄まで見る**
// (さっぴさんの「留萌」は概要欄にあった語で、番組ページの検索がそれを拾えたのが
//  発端。アプリ側の検索は題名しか見ないので、ここが唯一引ける場所になる)。
//
// 索引は拠点キャッシュに載せる(photoPool・samePeriodと同じcachedJsonの手)。
// 全5番組479回のフィードを毎回パースすると無料プランのCPU 10msを超えるため、
// **必要な列だけに削った索引**を作って30分持つ=打鍵のたびに走るのは配列の走査だけ。
// 索引は1本だけ持つ(照合用の別版を足すとJSONが倍になり、parseだけで10msに迫る)。
const INDEX_TTL_SEC = 30 * 60
const MAX_HITS = 24

export type EpisodeHit = {
  id: string
  showSlug: string
  showName: string
  title: string
  date: string
  href: string
  thumb: string | null
}

type IndexRow = EpisodeHit & { hay: string }

// --- 表記ゆれの吸収(2026-08-23 Andy指摘「猫・ねこ・ネコで結果が違う」) ---
//
// 原則:**打った文字はそのまま照合し、機械が勝手に増やした読みだけ厳しく照合する。**
//
// 最初の実装はひらがなを全部カタカナに畳んだ索引を作ったが、これが逆に壊れていた。
// 「鹿→シカ」が「忙しかった」「イシカリナベ」に、「蟹→カニ」が「明らかに」に、
// 「蟻→アリ」が「ありがとう」に当たり、実測で43件・46件・61件の紛れが出ていた。
// 打った人が「しか」と打って「忙しかった」に当たるのは検索として正しいが、
// 機械が「鹿」から勝手に導いた「シカ」がそこへ当たるのは事故なので、扱いを分ける。
//  ・索引(hay)はひらがなを畳まない。全角半角と大小の統一(NFKC+小文字)だけ
//  ・打った語は、かなの一字一字を「ひら/カタどちらでも可」として照合する
//  ・対応表から導いた読みは、素の表記としか当たらない(ひらがなへは降りない)
const base = (s: string) => s.normalize('NFKC').toLowerCase()
const toKatakana = (s: string) =>
  s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))

// 漢字とかなの対応表。読みの知識が要るので機械では潰せない。形態素解析器は辞書が
// 数十MBあってWorkerに載らないため、**番組に出てくる語だけの表**を持つ。
//
// 【この表を足すときの決まり】必ず実測してから足すこと。基準は「その読みが
// 他の語の中に食い込まないこと」。捨てた例(いずれも紛れが実利を上回った):
//   鳥→トリ  … トリガイ・トリカジ・トリュフ・エントリー・オーストリア
//   栗鼠→リス … リスナー・リスク・リスト(97回)
//   鰤→ブリ  … ゴキブリ・ハイブリッド・カイツブリ(本物のブリは1回も無い)
//   蝶→チョウ … ダチョウ・タンチョウ・チョウザメ
//   貂→テン  … テングサ・サボテン・ラテン語
//   鯖→サバ  … サバイバル・サバンナ・キャッサバ
//   鱈→タラ  … アドバタラヂオ・ベジポタラーメン
const SYNONYMS: string[][] = [
  // 生きもの
  ['猫', 'ネコ'], ['犬', 'イヌ'], ['狼', 'オオカミ'], ['狐', 'キツネ'], ['狸', 'タヌキ'],
  ['兎', 'ウサギ'], ['熊', 'クマ'], ['羆', 'ヒグマ'], ['鹿', 'シカ'], ['駱駝', 'ラクダ'],
  ['鯨', 'クジラ'], ['海豚', 'イルカ'], ['海豹', 'アザラシ'], ['海獺', 'ラッコ'],
  ['烏', 'カラス'], ['鴉', 'カラス'], ['梟', 'フクロウ'], ['鷲', 'ワシ'], ['鷗', 'カモメ'],
  ['啄木鳥', 'キツツキ'], ['蛇', 'ヘビ'], ['亀', 'カメ'], ['蛙', 'カエル'],
  ['虫', 'ムシ'], ['蟻', 'アリ'],
  // サカナと海のもの
  ['魚', 'サカナ'], ['鮭', 'サケ'], ['鱒', 'マス'], ['鰊', 'ニシン'], ['鰯', 'イワシ'],
  ['鰺', 'アジ'], ['鮪', 'マグロ'], ['鰈', 'カレイ'], ['鮃', 'ヒラメ'], ['鮫', 'サメ'],
  ['鱸', 'スズキ'], ['秋刀魚', 'サンマ'], ['公魚', 'ワカサギ'], ['蟹', 'カニ'],
  ['海老', 'エビ'], ['烏賊', 'イカ'], ['蛸', 'タコ'], ['牡蠣', 'カキ'],
  ['帆立', 'ホタテ'], ['雲丹', 'ウニ'], ['海胆', 'ウニ'],
  ['昆布', 'コンブ'], ['若布', 'ワカメ'], ['和布蕪', 'メカブ'],
  // 山のもの・食べもの
  ['苔', 'コケ'], ['茸', 'キノコ'], ['筍', 'タケノコ'], ['蕗', 'フキ'], ['葡萄', 'ブドウ'],
  ['白樺', 'シラカバ'], ['蕎麦', 'ソバ'], ['珈琲', 'コーヒー'],
  // その他
  ['蝦夷', 'エゾ'],
  // 北海道の地名(別ファイル。市町村は179という閉じた一覧なので育て続けなくていい)
  ...HOKKAIDO_PLACES.map(([kanji, kana]) => [kanji, kana]),
]

// 導いた読みが「別の語の一部」として当たってしまう実例(全て実測)。
// この表に載った語の中で起きた当たりは、機械の推測としては採らない。
// **打った語そのものには効かない**(読みより長い語だけが除外に効く決まりなので、
// 「ワカメ」と打った人はワカメ回にちゃんと着く。効くのは「亀→カメ」の側だけ)。
const MASKS = [
  'メカニズム', // 蟹→カニ
  'ワカメ', 'カメラ', 'オカメ', 'アカメ', 'タカメ', // 亀→カメ
  'イワシ', 'ワシントン', // 鷲→ワシ
  'ゼネコン', // 猫→ネコ
  'アイヌ', // 犬→イヌ
  'ヘビー', // 蛇→ヘビ
  'フライカ', 'スイカ', 'イカダ', // 烏賊→イカ
  'クマムシ', 'クマリン', 'コクマル', 'ビークマン', // 熊→クマ
  'イシカリ', 'オスシカ', // 鹿→シカ
  'バイオマス', // 鱒→マス
  'アジア', // 鰺→アジ
  'ホソバ', // 蕎麦→ソバ
  'タコス', // 蛸→タコ
  'スペシャリスト', // 斜里→シャリ
  'キタミズ', // 北見→キタミ
  // かなで打った場合だけ起きるもの(実測。ひらがなは文法を担うので稀に語の途中に出る)
  'あくまで', // くま
].map(base)

// 打った語を対応表で言い換える。「猫の話」なら「ネコの話」も試す。
// 組み合わせが増えすぎないよう上限を置く
const MAX_VARIANTS = 8

function derive(needle: string): string[] {
  const seeds = new Set([needle, toKatakana(needle)])
  const out = new Set<string>()
  for (const seed of seeds) {
    for (const group of SYNONYMS) {
      for (const form of group) {
        if (!seed.includes(form)) continue
        for (const other of group) {
          if (other !== form) out.add(seed.split(form).join(other))
        }
      }
    }
  }
  for (const s of seeds) out.delete(s)
  return [...out].slice(0, MAX_VARIANTS)
}

// 打った語の照合。**ひらがなで打った字だけ**、カタカナ表記にも当たるようにする。
//
// 逆向き(カタカナで打った人をひらがなにも当てる)はやらない。日本語はひらがなが
// 文法を担うので、「マス」が「〜し**ます**」に、「タコ」が「行っ**たこ**と」に、
// 「アリ」が「**あり**がとう」に当たってしまう(実測でそれぞれ25件近い誤爆)。
// 変換前のかな打ちを拾えれば目的は足りるので、片側だけでいい。
const RE_SPECIAL = /[.*+?^${}()|[\]\\]/
function hiraganaAlsoKatakana(needle: string): RegExp | null {
  if (!/[ぁ-ゖ]/.test(needle)) return null // ひらがなが無ければ素の部分一致で足りる
  const src = [...needle]
    .map((c) => {
      const code = c.charCodeAt(0)
      if (code >= 0x3041 && code <= 0x3096) {
        return `[${c}${String.fromCharCode(code + 0x60)}]`
      }
      return RE_SPECIAL.test(c) ? `\\${c}` : c
    })
    .join('')
  try {
    return new RegExp(src, 'g')
  } catch {
    return null
  }
}

// 当たった位置が除外語の中なら採らない。当たりが一つでも外にあれば採る。
// 除外は**読みより長い語にしか効かない**ので、「ワカメ」と打った人はワカメ回に着く
function accept(hay: string, at: number, len: number, masks: string[]): boolean {
  return !masks.some((m) => coveredBy(hay, m, at, len))
}

function matches(hay: string, needle: string, re: RegExp | null, masks: string[]): boolean {
  if (re) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(hay))) {
      if (masks.length === 0 || accept(hay, m.index, m[0].length, masks)) return true
    }
    return false
  }
  let i = hay.indexOf(needle)
  while (i >= 0) {
    if (masks.length === 0 || accept(hay, i, needle.length, masks)) return true
    i = hay.indexOf(needle, i + 1)
  }
  return false
}

function coveredBy(hay: string, mask: string, at: number, len: number): boolean {
  let j = hay.indexOf(mask)
  while (j >= 0) {
    if (j <= at && at + len <= j + mask.length) return true
    if (j > at) return false
    j = hay.indexOf(mask, j + 1)
  }
  return false
}

async function buildIndex(): Promise<IndexRow[]> {
  const feeds = await Promise.all(
    SHOWS.map((s) => (s.feed ? fetchShowFeed(s.feed, s.since) : Promise.resolve(null)))
  )
  const rows: IndexRow[] = []
  SHOWS.forEach((s, i) => {
    const feed = feeds[i]
    if (!feed) return
    for (const ep of feed.episodes) {
      rows.push({
        id: ep.id,
        showSlug: s.slug,
        showName: s.display ?? s.shortName ?? s.name,
        title: ep.title,
        date: ep.date,
        href: `/podcast/${s.slug}/${ep.id}`,
        // 回のアートがあればそれ、無ければ番組カバー(番組ページの索引と同じ落とし方)
        thumb: ep.image ?? feed.image ?? null,
        // 突き合わせ用。題名+概要欄(パース時に600字へ切ってある)を1本に
        hay: base(`${ep.title} ${ep.searchText}`),
      })
    }
  })
  return rows
}

function episodeIndex(): Promise<IndexRow[]> {
  return cachedJson('episode-search-index-3', INDEX_TTL_SEC, buildIndex)
}

// 部分一致(日本語なので語分割はしない。deskアーカイブ検索と同じ考え方)。
// 新しい回を上に。空クエリは何も返さない(候補の羅列をしない=画面を静かに保つ)
export async function searchEpisodes(query: string): Promise<EpisodeHit[]> {
  const needle = base(query.trim())
  if (needle.length === 0) return []
  const derived = derive(needle)
  const forms = [needle, ...derived]
  // 効きうる除外語だけに絞る。読みより長い語しか除外に使わない(前述の決まり)。
  // 打った語にも同じ網をかける: 「ネコ」と打った人にゼネコンの回を出さないため
  const masks = MASKS.filter((m) =>
    forms.some((f) => m.length > f.length && (m.includes(f) || m.includes(toKatakana(f))))
  )
  // 対応表から導いた読みは素の表記としか当てない(かなへは降ろさない)
  const matchers = [
    { needle, re: hiraganaAlsoKatakana(needle) },
    ...derived.map((f) => ({ needle: f, re: null })),
  ]
  let rows: IndexRow[]
  try {
    rows = await episodeIndex()
  } catch {
    return [] // 索引が引けなくても画面は壊さない
  }
  return rows
    .filter((r) => matchers.some((m) => matches(r.hay, m.needle, m.re, masks)))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, MAX_HITS)
    // 突き合わせ用のhayは返さない(クライアントへ本文を送らない)
    .map((r) => ({
      id: r.id,
      showSlug: r.showSlug,
      showName: r.showName,
      title: r.title,
      date: r.date,
      href: r.href,
      thumb: r.thumb,
    }))
}
