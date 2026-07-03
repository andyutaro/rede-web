import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// pub接続用トークンは、ログイン済みセッションにのみサーバーから渡す。
// 未ログインの匿名アクセスにはトークンを一切見せない(書き込み口の鍵はここで守る)。
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  return NextResponse.json({
    token: process.env.SCRIBE_PUB_TOKEN,
    relay: process.env.SCRIBE_RELAY_URL,
  })
}
