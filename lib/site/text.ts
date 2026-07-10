// scribeの生HTML(<br>方式)からプレーンテキスト抜粋を作る。
// レンダリングには使わない(表示系はサニタイザを通す)。一覧の抜粋・文字数用。
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function excerpt(html: string, length = 80): string {
  return htmlToPlainText(html).slice(0, length)
}

// 本文の最初の<img>のsrc(サムネイル決定ロジック①、handoff-notes §11)
export function firstImageSrc(html: string): string | null {
  const m = html.match(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)
  return m ? m[1] : null
}

// 「2026-07-03」→「2026.07.03」(リスト用) / 「07.03」(タイル用)(§10)
export function dateDots(isoDate: string): string {
  return isoDate.replaceAll('-', '.')
}

// scribeにはタイトルが無いため、当日の日付から一意なタイトルを自動導出する。
// 「2026-07-06」→「20260706」。scribeのタイトルはサイト全体でこのパターン。
export function scribeTitle(isoDate: string): string {
  return isoDate.replaceAll('-', '')
}

// 一覧の日付表記規則(2026-07-10): 今年のものは「07.09」、
// 今年より前のものは年入り「2025.07.09」(Article/scribe/Podcast共通)
export function dateShort(isoDate: string): string {
  const currentYear = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' })
    .format(new Date())
    .slice(0, 4)
  return isoDate.startsWith(currentYear)
    ? isoDate.slice(5).replace('-', '.')
    : isoDate.replaceAll('-', '.')
}
