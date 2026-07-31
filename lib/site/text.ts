// scribeの生HTML(<br>方式)からプレーンテキスト抜粋を作る。
// レンダリングには使わない(表示系はサニタイザを通す)。一覧の抜粋・文字数用。
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/[\u2060\u200b-\u200d\ufeff]/g, '') // 不可視文字(RSS概要欄の飾り)は検索一致を妨げるので除去
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

// 本文の最初の<img>のsrc(サムネイル決定ロジック①、handoff-notes §11)
// meta description用の本文抜粋(2026-07-25): タグ・実体参照を落とし、空白を詰めて
// n字で切る。検索結果のスニペットにAndy自身の言葉を出すためのもの(生成はしない)
export function plainExcerpt(html: string, max = 110): string {
  const t = htmlToPlainText(html).replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

export function firstImageSrc(html: string): string | null {
  const m = html.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)
  return m ? m[1] : null
}

// 東京タイムゾーンのYYYY-MM-DD導出(en-CA=ISO形式)。フォーマッタ生成は高コストなので
// モジュールで1回だけ作り、一覧系(1行毎に日付導出)から共有する
const TOKYO_YMD = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' })
export function tokyoYmd(date: string | Date): string {
  return TOKYO_YMD.format(typeof date === 'string' ? new Date(date) : date)
}

// 東京基準で「n日前」のYYYY-MM-DD。NEWドット等の鮮度境界に使う。
// Date.now()はコンポーネントrenderに直接書けない(react-hooks purity)ためここに閉じる
export function tokyoDaysAgo(days: number): string {
  return tokyoYmd(new Date(Date.now() - days * 24 * 60 * 60 * 1000))
}

// 「2026-07-03」→「2026.07.03」(リスト用) / 「07.03」(タイル用)(§10)
export function dateDots(isoDate: string): string {
  return isoDate.replaceAll('-', '.')
}

// 更新リストの日付を「年」と「月日」に分ける(2026-07-31)。スマホでは今年の行の年を
// CSSで畳んで柱の幅を本文に返す(全行同じ「2026.」が行頭に並んでも読む値が無いため)。
// 年が意味を持つ昨年以前の行はthisYear=falseになり畳まれない(dateShortと同じ考え方)。
// データも表示文字列も作り変えないので、デスクトップは1pxも変わらない
export function dateDotsParts(isoDate: string): {
  year: string
  rest: string
  thisYear: boolean
} {
  const currentYear = tokyoYmd(new Date()).slice(0, 4)
  return {
    year: `${isoDate.slice(0, 4)}.`,
    rest: isoDate.slice(5).replace('-', '.'),
    thisYear: isoDate.startsWith(currentYear),
  }
}

// 注釈に添える日時(2026-07-28): 「2026.07.28 21:34」。東京基準。
// 注釈は「後から書き込んだもの」なので、いつの追記かが分かることに意味がある
const TOKYO_DT = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
// 日付と時刻を分けて返す。並べ方(間隔・右寄せ)は表示側のCSSが決める
// ——「2026.07.28 21:34」と続けて書くと日と時が一連の数字に見えるため(Andy指摘)
export function dateTimeParts(iso: string): { date: string; time: string } | null {
  try {
    const p = Object.fromEntries(
      TOKYO_DT.formatToParts(new Date(iso)).map((x) => [x.type, x.value])
    )
    if (!p.year) return null
    return { date: `${p.year}.${p.month}.${p.day}`, time: `${p.hour}:${p.minute}` }
  } catch {
    return null
  }
}

// scribeにはタイトルが無いため、当日の日付から一意なタイトルを自動導出する。
// 「2026-07-06」→「20260706」。scribeのタイトルはサイト全体でこのパターン。
export function scribeTitle(isoDate: string): string {
  return isoDate.replaceAll('-', '')
}

// 一覧の日付表記規則(2026-07-10): 今年のものは「07.09」、
// 今年より前のものは年入り「2025.07.09」(Article/scribe/Podcast共通)
export function dateShort(isoDate: string): string {
  const currentYear = tokyoYmd(new Date()).slice(0, 4)
  return isoDate.startsWith(currentYear)
    ? isoDate.slice(5).replace('-', '.')
    : isoDate.replaceAll('-', '.')
}
