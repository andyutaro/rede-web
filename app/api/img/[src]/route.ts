import { NextResponse } from 'next/server'

// ポッドキャストCDN画像の同一オリジンプロキシ(2026-07-19)。
// Anchor(cloudfront)がCloudflare Image Transformationsの直接フェッチを
// 403で拒否するため、いったん自ドメインで取得して変換元を同一オリジンにする。
// 変換結果(/cdn-cgi/image/…)はエッジにキャッシュされるので、この二段ホップが
// 走るのはユニーク画像ごとの初回のみ。
//
// オープンプロキシ化を防ぐため、取得先はポッドキャスト系CDNのホストに限定する
// (Supabase等うちが使う他のオリジンは直接変換が通るのでここを通さない)。
const ALLOWED_HOST = /(\.cloudfront\.net|\.anchor\.fm|\.spotifycdn\.com|\.megaphone\.fm)$/i

export async function GET(_req: Request, { params }: { params: Promise<{ src: string }> }) {
  const { src } = await params
  let url: URL
  try {
    url = new URL(decodeURIComponent(src))
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 })
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOST.test(url.hostname)) {
    return NextResponse.json({ error: 'host not allowed' }, { status: 403 })
  }

  const upstream = await fetch(url.href, {
    headers: {
      // 通常ブラウザ相当のUA(CDN側のフェッチャー弾きを回避する目的であり、
      // 対象は公開RSSに記載された自番組のカバーアート)
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
    },
  })
  if (!upstream.ok) {
    return NextResponse.json({ error: 'upstream error' }, { status: 502 })
  }
  const type = upstream.headers.get('content-type') ?? ''
  if (!type.startsWith('image/')) {
    return NextResponse.json({ error: 'not an image' }, { status: 502 })
  }
  return new Response(upstream.body, {
    headers: {
      'content-type': type,
      // カバーアートはURL自体がアップロードごとに変わる(実質immutable)
      'cache-control': 'public, max-age=2592000, immutable',
    },
  })
}
