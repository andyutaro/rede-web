import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

// Aboutコンテンツの保存。scribe保存と同じく、書き込みはユーザーのセッション
// クライアントで行い(service_roleは使わない)、RLSの"authenticated"ポリシーで
// 本人だけ書けることを担保する。保存後に/aboutを再生成して編集を即反映する。
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let data: unknown
  try {
    data = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  if (!data || typeof data !== 'object') {
    return NextResponse.json({ error: 'invalid content' }, { status: 400 })
  }

  const { error } = await supabase
    .from('site_content')
    .upsert({ key: 'about', data, updated_at: new Date().toISOString() })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  revalidatePath('/about')
  return NextResponse.json({ ok: true })
}
