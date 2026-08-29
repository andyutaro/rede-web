import { NextResponse } from 'next/server'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { createClient } from '@/lib/supabase/server'
import { ALLOWED_EXT, contentTypeFor, mediaUrl, newMediaPath } from '@/lib/site/media'

// メディアのアップロード(2026-08-29)。R2の rede-web-media へ直接書き、
// media.andyutaro.com のURLを返す。
//
// **なぜサーバーを経由するのか。** 旧経路(/api/scribe/upload-url)は署名付きURLを
// 発行してブラウザから直接ストレージへ送らせていた。理由はVercelの4.5MBボディ制限で、
// Cloudflareへ移った時点でその制約は消えている。R2に同じ形(署名URL)を作るには
// S3互換のアクセスキーをダッシュボードで発行する必要があるが、Workerは
// バインディング経由でバケットに直接書ける(backupが既にそうしている)。
// 鍵を増やさない方を採る。本文はストリームのまま流すのでメモリに全部載せない。
const MAX_UPLOAD = 50 * 1024 * 1024

type R2Put = {
  put(key: string, value: ReadableStream | ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>
}

// メソッドはPUT。クライアント(HtmlEditorのputWithProgress)は進捗を取るために
// XHRでPUTしており、POSTだけを公開していると405で弾かれる(2026-08-29に踏んだ)
export async function PUT(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const ext = (new URL(request.url).searchParams.get('ext') ?? '').toLowerCase()
  if (!ALLOWED_EXT.test(ext)) {
    return NextResponse.json({ error: 'unsupported file type' }, { status: 400 })
  }

  // 長さは申告(content-length)で先に断る。R2へ流し終えてから断ると転送が無駄になる
  const declaredLen = Number(request.headers.get('content-length') ?? '0')
  if (declaredLen > MAX_UPLOAD) {
    return NextResponse.json({ error: 'too large' }, { status: 413 })
  }
  if (!request.body) return NextResponse.json({ error: 'empty body' }, { status: 400 })

  const { env } = await getCloudflareContext({ async: true })
  const bucket = (env as unknown as { MEDIA_BUCKET?: R2Put }).MEDIA_BUCKET
  if (!bucket) {
    // devでバインディングが無い場合もここに来る。黙って失敗させない
    return NextResponse.json({ error: 'MEDIA_BUCKET未設定' }, { status: 500 })
  }

  const path = newMediaPath(ext)
  const contentType = contentTypeFor(ext, request.headers.get('content-type'))
  try {
    await bucket.put(path, request.body, { httpMetadata: { contentType } })
  } catch (e) {
    return NextResponse.json({ error: `upload failed: ${String(e).slice(0, 120)}` }, { status: 500 })
  }
  return NextResponse.json({ path, publicUrl: mediaUrl(path) })
}
