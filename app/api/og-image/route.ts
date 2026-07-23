import { NextResponse } from 'next/server'
import { showBySlug } from '@/lib/site/shows'
import { fetchShowFeedLight } from '@/lib/site/podcastFeed'
import { imgThumb, IMG_W } from '@/lib/site/img'

// SNSカード用の安定画像URL(2026-07-22)。AnchorのカバーURLはローテーションで
// 失効するため、OGPには生URLではなくこのルートを焼き込み、取得時点の生きた
// URLへ302する。スクレイパーは共有・再取得のたびにここを踏む=常に現行URLへ
// 解決される。?show=番組slug(&ep=エピソードID)。
export async function GET(request: Request) {
  const url = new URL(request.url)
  const slug = url.searchParams.get('show') ?? ''
  const epId = url.searchParams.get('ep')
  const show = showBySlug(slug)
  if (!show?.feed) return new Response('not found', { status: 404 })
  const feed = await fetchShowFeedLight(show.feed, show.since)
  const image = (epId ? feed?.episodes.find((e) => e.id === epId)?.image : null) ?? feed?.image
  if (!image) return new Response('not found', { status: 404 })
  return NextResponse.redirect(imgThumb(image, IMG_W.og), {
    status: 302,
    // フィードキャッシュと同じ30分。失効URLを掴んでも30分で自己回復する
    headers: { 'cache-control': 'public, max-age=1800' },
  })
}
