import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

const BUCKET = 'scribe-media'

// 画像/動画/音声/PDFアップロード用の署名付きURLを発行する。
// 書き込みの認可はこのルートのセッション認証で担保し(発行はログイン済みのみ)、
// クライアントは署名URLへ直接アップロードする。Vercelの4.5MBボディ制限を
// 回避するため、ファイル本体はこのサーバーを経由させない。読み取りは公開バケット。
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { ext?: string }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  // 受け付ける拡張子。**エディタ側で種類を増やしたらここも必ず足すこと。**
  // 2026-08-27に音声(mp3等)を貼れるようにした際、クライアントだけ直して
  // ここを忘れたため、上げようとすると「アップロード失敗」だけが出ていた
  // (このルートが400を返し、クライアントのcatchに落ちる)。
  // 音声: mp3=最も普通、m4a=iPhoneのボイスメモ、wav/flac=無圧縮の素材、
  // aac/ogg/oga/opus=その他。バケット側にMIME制限は無いので、ここが唯一の関門
  const ext = (body.ext ?? '').toLowerCase()
  const ALLOWED_EXT =
    /^(jpg|jpeg|png|gif|webp|heic|pdf|mp4|mov|webm|m4v|mp3|m4a|wav|aac|flac|ogg|oga|opus)$/
  if (!ALLOWED_EXT.test(ext)) {
    return NextResponse.json({ error: 'unsupported file type' }, { status: 400 })
  }

  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
  const path = `${date}/${crypto.randomUUID()}.${ext}`

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { data, error } = await service.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    path: data.path,
    token: data.token,
    signedUrl: data.signedUrl,
    publicUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${data.path}`,
  })
}
