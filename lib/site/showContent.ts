import { createService } from '@/lib/supabase/service'
import { SHOWS, type Show } from './shows'
import type { CastRow } from './pageText'

// 番組ページの「言葉」をstudioから編集できるようにする層(2026-10-15 Andy指定)。
//
// **言葉だけを上書きし、構造はコードに残す。** slug・ORIGINAL/WORKSの群・
// フィードURL・取り込み開始日・ヒーロー映像のパス・地図の緯度経度・派生記事のIDは
// SHOWS(lib/site/shows.ts)のまま。フォームから触れるようにすると壊れ方が静かだから——
// フィードURLを一字間違えれば番組が丸ごと消え、緯度経度はフォーム上で意味が読めない。
//
// **空欄はその項目を出さない**(2026-10-15 Andy決定)。コードの既定には戻らない
// (ROLEや注記を「消す」操作ができるようにするため)。
//
// 保存先は site_content の `show:<slug>`。読み出しはここ1箇所に閉じ、
// 言葉を表示する画面だけが getShows()/getShow() を使う。slugとフィードURLしか
// 見ない画面(sitemap・cron・検索・キュー等)は SHOWS を直接使い続ける
// =書き換えの影響範囲を最小にする。
export type ShowOverride = {
  name?: string
  shortName?: string
  display?: string
  intro?: string
  role?: string
  cast?: CastRow[]
  place?: { ja?: string; en?: string; note?: string }
  platforms?: { spotify?: string; apple?: string; listen?: string }
  otayoriTopics?: string[]
  otayoriUrl?: string
}

export const showKey = (slug: string) => `show:${slug}`

// 空文字・空配列は「出さない」= undefined にする。未定義のキーは触らない(既定のまま)
function pick<T>(value: T | undefined, current: T | undefined): T | undefined {
  if (value === undefined) return current
  if (typeof value === 'string') return value.trim() === '' ? undefined : (value.trim() as T)
  if (Array.isArray(value)) return value.length === 0 ? undefined : value
  return value
}

export function mergeShow(show: Show, o: ShowOverride | undefined): Show {
  if (!o) return show
  const next: Show = { ...show }
  next.name = pick(o.name, show.name) ?? show.name // 名前だけは空にできない(全面で使う)
  next.shortName = pick(o.shortName, show.shortName)
  next.display = pick(o.display, show.display)
  next.intro = pick(o.intro, show.intro)
  next.role = pick(o.role, show.role)
  next.cast = pick(o.cast, show.cast)
  next.otayoriTopics = pick(o.otayoriTopics, show.otayoriTopics)
  next.otayoriUrl = pick(o.otayoriUrl, show.otayoriUrl)
  if (o.place && show.place) {
    // 座標と地図の種類はコードのまま。文字だけ差し替える
    next.place = {
      ...show.place,
      ja: pick(o.place.ja, show.place.ja) ?? show.place.ja,
      en: pick(o.place.en, show.place.en) ?? show.place.en,
      note: pick(o.place.note, show.place.note),
    }
  }
  if (o.platforms) {
    const p = {
      spotify: pick(o.platforms.spotify, show.platforms?.spotify),
      apple: pick(o.platforms.apple, show.platforms?.apple),
      listen: pick(o.platforms.listen, show.platforms?.listen),
    }
    next.platforms = p.spotify || p.apple || p.listen ? p : undefined
  }
  return next
}

async function readOverrides(): Promise<Record<string, ShowOverride>> {
  try {
    const service = createService()
    const { data } = await service
      .from('site_content')
      .select('key, data')
      .like('key', 'show:%')
    const out: Record<string, ShowOverride> = {}
    for (const row of data ?? []) {
      const slug = String(row.key).slice('show:'.length)
      if (slug) out[slug] = (row.data ?? {}) as ShowOverride
    }
    return out
  } catch {
    return {} // テーブル未作成・到達不可時はコードの既定で描く
  }
}

// 言葉を表示する画面はこれを使う。上書きが無ければSHOWSそのまま
export async function getShows(): Promise<Show[]> {
  const o = await readOverrides()
  return SHOWS.map((s) => mergeShow(s, o[s.slug]))
}

export async function getShow(slug: string): Promise<Show | undefined> {
  const shows = await getShows()
  return shows.find((s) => s.slug === slug)
}

// studioのエディタが現在値を出すために使う(上書きが無ければコードの既定が初期値)
export async function getShowForEdit(slug: string): Promise<Show | undefined> {
  return getShow(slug)
}

// おたよりの宛先(2026-10-15)。番組名も項目もstudioで上書きできるので、
// **フォームとAPIの検証が必ず同じ集合を見る**ようにここを単一の出所にする
// (別々の出所にすると、名前を変えた瞬間に送信が弾かれる)。
// 絞り込みの条件(オリジナル・配信中・継続中)はSHOWS側の定義と同じ。
import { otayoriTopicsOf } from './shows'

export async function otayoriShowsLive(): Promise<Show[]> {
  return (await getShows()).filter((s) => s.group === 'original' && s.feed && !s.ended)
}

export async function otayoriLabelsLive(): Promise<string[]> {
  const shows = await otayoriShowsLive()
  return shows.flatMap((s) => {
    const name = s.shortName ?? s.name
    return otayoriTopicsOf(s).map((t) => `${name} / ${t}`)
  })
}
