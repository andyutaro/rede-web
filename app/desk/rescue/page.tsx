import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RescueList from './RescueList'

// 端末に残っている下書きの取り出し口(2026-08-16)。
//
// deskは打鍵ごとにlocalStorageへ下書きを書いている(圏外・タブ破棄への保険)。
// ところがAndroid Chromeでは中身を覗く手段が無く、他端末の上書きでサーバー側の
// 本文が消えたとき、端末に残っている本文を取り出せなかった。その口。
// 認証必須(/deskと同じ)。既定は読むだけで、書き戻しは明示操作のときだけ。
export default async function DeskRescuePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <RescueList />
}
