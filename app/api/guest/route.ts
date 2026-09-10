import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { resolveGuestEpisode, audioHostOf, audioHostAllowed } from '@/lib/site/guestEpisodes'

// ゲスト出演の登録(2026-09-10)。studioの PODCAST INBOX ? tab=guest から呼ぶ。
// action=resolve … 貼られたURLを解決してプレビューを返す(保存しない)
// action=save    … 解決した1件を保存する
// action=delete  … 2段階削除(deleted_atを立てる)
//
// エピソード本体はRSSが真実なので、保存するのは feedUrl + episode id + 送客URL、
// および取得失敗時の控え(題名・番組名・公開日・尺)だけ。

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: {
    action?: string
    spotifyUrl?: string
    feedUrl?: string
    title?: string
    id?: string
  }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  if (body.action === 'delete') {
    if (!body.id) return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
    const { error } = await supabase
      .from('guest_episodes')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    revalidatePath('/podcast')
    return NextResponse.json({ ok: true })
  }

  const spotifyUrl = body.spotifyUrl?.trim() || undefined
  const feedUrl = body.feedUrl?.trim() || undefined
  if (!spotifyUrl && !feedUrl) {
    return NextResponse.json({ error: 'SpotifyのURLかRSSのURLが要る' }, { status: 400 })
  }

  const resolved = await resolveGuestEpisode({ spotifyUrl, feedUrl, title: body.title })
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.message, step: resolved.step }, { status: 422 })
  }

  const preview = {
    feedUrl: resolved.feedUrl,
    guid: resolved.guid,
    showName: resolved.showName,
    title: resolved.ep.title,
    date: resolved.ep.date,
    duration: resolved.ep.duration,
    image: resolved.ep.image,
    hasAudio: Boolean(resolved.ep.audioUrl),
    // CSPのmedia-srcに無いホストは鳴らない。貼った時点で気づけるように返す
    audioHost: audioHostOf(resolved.ep.audioUrl),
    audioAllowed: audioHostAllowed(resolved.ep.audioUrl),
  }

  if (body.action !== 'save') return NextResponse.json({ ok: true, preview })

  // 同じ回の二重登録はupsertで吸収(feed_url+episode_guidに一意制約)。
  // 一度消した回を貼り直したときに復活させたいので deleted_at も戻す
  const { error } = await supabase.from('guest_episodes').upsert(
    {
      feed_url: resolved.feedUrl,
      episode_guid: resolved.guid,
      spotify_url: spotifyUrl ?? null,
      show_name: resolved.showName,
      title: resolved.ep.title,
      published_at: resolved.ep.date,
      duration: resolved.ep.duration,
      deleted_at: null,
    },
    { onConflict: 'feed_url,episode_guid' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidatePath('/podcast')
  return NextResponse.json({ ok: true, preview })
}
