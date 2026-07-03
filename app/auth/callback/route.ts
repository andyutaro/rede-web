import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// マジックリンクのメール内URLがここに着地する。codeをセッションに交換して/deskへ。
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}/desk`)
    }
  }

  return NextResponse.redirect(`${origin}/login`)
}
