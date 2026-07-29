import { cookies } from 'next/headers'
import { createClient } from './server'

// 公開ページで「いま見ているのは本人か」を判定する(2026-07-28、注釈の編集可否)。
//
// 公開ページは訪問者の99.9%が匿名なので、まずCookieの有無だけを見て即falseを返す
// (認証セッションが無ければSupabaseに問い合わせない=匿名の表示を1msも重くしない)。
// Cookieがある時だけ本検証に進む。**この判定は表示の都合にすぎず、書き込みの可否は
// 必ずAPI側(/api/annotations)で再検証する**。
export async function isEditor(): Promise<boolean> {
  try {
    const jar = await cookies()
    const hasSession = jar.getAll().some((c) => c.name.startsWith('sb-'))
    if (!hasSession) return false
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return Boolean(user)
  } catch {
    return false
  }
}
