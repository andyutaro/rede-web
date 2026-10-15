import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { SHOWS } from '@/lib/site/shows'

// 固定ページ(contact/membership/privacy)のコンテンツ保存(2026-07-13)。
// Aboutの/api/about/saveと同方針: セッションクライアント+RLSで本人だけ書ける。
// dataは構造化済みJSON(studioのPageEditorがテキスト規約をパースして送る)。
const KEYS = ['contact', 'membership', 'privacy', 'desk_preamble'] as const

// 番組ページの言葉(2026-10-15)。キーは `show:<slug>` で、slugはSHOWSにある番組だけ
// 受ける(任意のキーでsite_contentに書けないようにする)
const SHOW_PREFIX = 'show:'
function showSlugOf(key: string): string | null {
  if (!key.startsWith(SHOW_PREFIX)) return null
  const slug = key.slice(SHOW_PREFIX.length)
  return SHOWS.some((s) => s.slug === slug) ? slug : null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { key?: string; data?: unknown }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { key, data } = body
  const showSlug = key ? showSlugOf(key) : null
  const known = !!key && ((KEYS as readonly string[]).includes(key) || showSlug !== null)
  if (!known || !data || typeof data !== 'object') {
    return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
  }

  const { error } = await supabase
    .from('site_content')
    .upsert({ key, data, updated_at: new Date().toISOString() })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 保存したその場で公開ページを作り直す(余分なキャッシュを挟んでいないので即時に出る)
  if (showSlug) {
    // 番組の言葉は番組ページだけでなく、棚・Home・About・おたよりの宛先にも出る。
    // 回の個別ページ(300枚超)はパターンでまとめて無効化する(必要になった時に作り直される)
    revalidatePath(`/podcast/${showSlug}`)
    revalidatePath('/podcast')
    revalidatePath('/')
    revalidatePath('/about')
    revalidatePath('/mail')
    revalidatePath('/podcast/[slug]/[episode]', 'page')
  } else if (key === 'desk_preamble') {
    // deskの冒頭定型文は確定アーカイブと当日のライブ全文に出る
    revalidatePath('/desk/[date]', 'page')
    revalidatePath('/live')
  } else {
    revalidatePath(`/${key}`)
  }
  return NextResponse.json({ ok: true })
}
