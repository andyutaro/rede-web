import type { SupabaseClient } from '@supabase/supabase-js'
import { htmlToPlainText } from '@/lib/site/text'
import { shelfPathForType } from '@/lib/site/photos'

// ブックマーク室の心臓部(2026-07-27)。
// - scanBookmarks: scribe/記事の本文を走査し、外部リンクをbookmarksテーブルへ同期する。
//   SSOTは本文(生HTML)。本文から消えたリンクは行ごと消す(テーブルは索引にすぎない)。
//   下書き・未確定scribeも対象(studioは私的な道具なので公開状態を問わない)。
// - fetchTitles: リンク先のページタイトルを少しずつ取得する。Workersの
//   サブリクエスト上限(無料50/回)があるため一括せず、夜間cron+手動ボタンで刻む。

// 自サイト・自インフラのURLはブックマークではない
const OWN_HOST_RE =
  /(^|\.)andyutaro\.com$|(^|\.)workers\.dev$|supabase\.co$|rede-relay\.onrender\.com$|^localhost$/i

export type BookmarkSource = {
  kind: 'scribe' | 'article' | 'photography' | 'physical' | 'event'
  label: string
  href: string
  date: string // YYYY-MM-DD
}

type Found = {
  url: string
  domain: string
  sources: BookmarkSource[]
  context: string | null
  first_seen: string
  last_seen: string
}

// 末尾に食い込みがちな和文の区切りを落とす(素URLをテキストから拾う時用)
const TRAIL_RE = /[)»」』】〉。、,.;:!?'"　]+$/

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.replace(TRAIL_RE, '')
  try {
    const u = new URL(trimmed)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (OWN_HOST_RE.test(u.hostname)) return null
    return u.toString()
  } catch {
    return null
  }
}

// 本文からリンクを列挙: <a href>とテキスト中の素URL(2026-07-03のURLリンク化以前の
// アーカイブ対応)。iframe埋め込み(Spotify等)はカードとして既に見えているので対象外
export function extractLinks(html: string): string[] {
  const urls = new Set<string>()
  for (const m of (html || '').matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const u = normalizeUrl(m[1])
    if (u) urls.add(u)
  }
  const plain = htmlToPlainText(html || '')
  for (const m of plain.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const u = normalizeUrl(m[0])
    if (u) urls.add(u)
  }
  return [...urls]
}

// リンクの周辺テキスト(なぜ貼ったかの手がかり)。プレーンテキスト上でURLの
// 位置を探し前後を切る。見つからなければnull(リンク文字列がURLでない場合など)
function contextAround(plain: string, url: string): string | null {
  const i = plain.indexOf(url)
  if (i < 0) return null
  const before = plain.slice(Math.max(0, i - 60), i).trimStart()
  const after = plain.slice(i + url.length, i + url.length + 60).trimEnd()
  const ctx = `${before}${after ? ' … ' + after : ''}`.replace(/\s+/g, ' ').trim()
  return ctx || null
}

export async function scanBookmarks(service: SupabaseClient): Promise<{
  found: number
  added: number
  removed: number
}> {
  const [{ data: days }, { data: arts }] = await Promise.all([
    service.from('scribe_days').select('date, html, deleted_at'),
    service.from('articles').select('id, title, type, html, published_at, created_at, deleted_at'),
  ])

  const map = new Map<string, Found>()
  const collect = (html: string, source: BookmarkSource) => {
    const plain = htmlToPlainText(html || '')
    for (const url of extractLinks(html)) {
      const cur = map.get(url)
      if (cur) {
        cur.sources.push(source)
        if (source.date < cur.first_seen) cur.first_seen = source.date
        if (source.date > cur.last_seen) cur.last_seen = source.date
        if (!cur.context) cur.context = contextAround(plain, url)
      } else {
        map.set(url, {
          url,
          domain: new URL(url).hostname.replace(/^www\./, ''),
          sources: [source],
          context: contextAround(plain, url),
          first_seen: source.date,
          last_seen: source.date,
        })
      }
    }
  }

  for (const d of days ?? []) {
    if (d.deleted_at || !d.html) continue
    const date = d.date as string
    collect(d.html as string, {
      kind: 'scribe',
      label: `scribe ${date.replaceAll('-', '')}`,
      href: `/desk/${date}`,
      date,
    })
  }
  const SHELF: Record<string, BookmarkSource['kind']> = {
    article: 'article',
    photography: 'photography',
    physical: 'physical',
    event: 'event',
  }
  // 下書き時の編集画面(部屋)。公開側の棚パスはshelfPathForTypeが唯一の出所
  const STUDIO_ROOM: Record<string, string> = {
    photography: '/studio/photography',
    physical: '/studio/physical',
    event: '/studio/events',
  }
  for (const a of arts ?? []) {
    if (a.deleted_at || !a.html) continue
    const kind = SHELF[a.type as string] ?? 'article'
    const date = String(a.published_at ?? a.created_at ?? '').slice(0, 10)
    const published = Boolean(a.published_at)
    const room = STUDIO_ROOM[a.type as string] ?? '/studio/notes'
    collect(a.html as string, {
      kind,
      label: ((a.title as string) || '').trim() || '(無題)',
      // 公開済みは公開ページへ、下書きはstudioの編集画面へ
      href: published ? `${shelfPathForType(a.type as string)}/${a.id}` : `${room}/${a.id}`,
      date: date || '1970-01-01',
    })
  }

  // 既存行と突き合わせ: 追加・更新(タイトル系は保持)・消滅行の削除
  const { data: existing, error } = await service.from('bookmarks').select('url')
  if (error) throw new Error(`bookmarks読み取り失敗(SQL未実行?): ${error.message}`)
  const existingSet = new Set((existing ?? []).map((r) => r.url as string))

  const rows = [...map.values()].map((f) => ({
    url: f.url,
    domain: f.domain,
    sources: f.sources,
    context: f.context,
    first_seen: f.first_seen,
    last_seen: f.last_seen,
  }))
  // upsertはtitle/fetched_at/hiddenに触れない(列を渡さない=既存値保持)
  for (let i = 0; i < rows.length; i += 200) {
    const { error: upErr } = await service
      .from('bookmarks')
      .upsert(rows.slice(i, i + 200), { onConflict: 'url' })
    if (upErr) throw new Error(upErr.message)
  }

  const gone = [...existingSet].filter((u) => !map.has(u))
  for (let i = 0; i < gone.length; i += 200) {
    await service.from('bookmarks').delete().in('url', gone.slice(i, i + 200))
  }

  return {
    found: rows.length,
    added: rows.filter((r) => !existingSet.has(r.url)).length,
    removed: gone.length,
  }
}

// リンク先タイトルの取得(未取得分をlimit件だけ)。失敗もfetched_atを立てて
// 前へ進む(壊れたリンクで毎回スタックしない)。再挑戦は手動の「再取得」で
export async function fetchTitles(
  service: SupabaseClient,
  limit: number
): Promise<{ tried: number; titled: number }> {
  const { data: pending } = await service
    .from('bookmarks')
    .select('url')
    .is('fetched_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  let titled = 0
  for (const row of pending ?? []) {
    const url = row.url as string
    let title: string | null = null
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; REDE-bookmarks/1.0; +https://andyutaro.com)',
          accept: 'text/html,application/xhtml+xml',
        },
      })
      const type = res.headers.get('content-type') ?? ''
      if (res.ok && /html/i.test(type)) {
        const body = (await res.text()).slice(0, 200000)
        const og = body.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
        const ogRev = body.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)
        const t = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
        const raw = og?.[1] ?? ogRev?.[1] ?? t?.[1] ?? ''
        title = decodeEntities(raw).replace(/\s+/g, ' ').trim().slice(0, 200) || null
      }
    } catch {
      // タイムアウト・到達不能: titleはnullのまま記録
    }
    await service
      .from('bookmarks')
      .update({ title, fetched_at: new Date().toISOString() })
      .eq('url', url)
    if (title) titled++
  }
  return { tried: (pending ?? []).length, titled }
}

// タイトルに出がちな実体参照だけ最小限デコード(依存を増やさない)
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
}
