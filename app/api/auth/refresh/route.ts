import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// セッションCookieの更新口(2026-07-14)。旧proxy.ts(updateSession)の代替。
// Cloudflare Workers移行にあたりNodeランタイム固定のproxyを廃止したため、
// 「長時間開いたstudio/deskタブのトークン失効防止」はこのRoute Handlerが担う。
// Route HandlerはCookieを書けるので、getUser()が期限切れトークンを検知すると
// @supabase/ssrがリフレッシュし、新しいトークンがレスポンスのSet-Cookieで永続化される。
// 呼び出し元はSessionKeepAlive(studio/deskに常駐、定期+タブ復帰時にping)。
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false }, { status: 401 })
  return NextResponse.json({ ok: true })
}
