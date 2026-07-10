import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// セッションのCookieはアクセスのたびに更新が必要(トークン失効を防ぐため)。
// これをmiddlewareでやらないと、/deskを長時間開いたままのタブでセッションが切れる。
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // /desk(放送卓)・/studio(編集室)配下は未ログインなら/loginへ。
  // それ以外(/login自体, /auth/callback, 静的アセット)は素通り。
  const path = request.nextUrl.pathname
  if (!user && (path.startsWith('/desk') || path.startsWith('/studio'))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
