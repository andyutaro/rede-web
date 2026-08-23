import { NextResponse } from 'next/server'
import { searchEpisodes } from '@/lib/site/episodeSearch'

// MENUの中の検索が叩く口(2026-08-23)。公開エンドポイント。
// 返すのは打った語に該当した最大24件だけ=全479回の本文をクライアントへ送らない
// (トップページは全訪問者が踏む場所なので、そこに0.8MBの索引は載せられない)。
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q') ?? ''
  // 極端に長い入力は走査させない(1文字は日本語だと有効なので通す)
  if (q.length > 60) return NextResponse.json({ hits: [] })
  return NextResponse.json({ hits: await searchEpisodes(q) })
}
