import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { EmailOtpType } from '@supabase/supabase-js'

// メールリンクのtoken_hashをサーバー側で検証してセッションを確立する
// (Supabase SSR公式推奨のパターン)。/auth/callback(PKCEコード交換)と併設し、
// どちらの形式のリンクが来ても受けられるようにする。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const rawType = searchParams.get('type')
  // 旧'magiclink'表記は現行GoTrueでは'email'に統合されている
  const type = (rawType === 'magiclink' ? 'email' : rawType) as EmailOtpType | null

  if (token_hash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) {
      return NextResponse.redirect(`${origin}/desk`)
    }
  }

  return NextResponse.redirect(`${origin}/login`)
}
