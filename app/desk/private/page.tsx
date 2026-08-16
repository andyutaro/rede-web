import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SessionKeepAlive from '../../studio/SessionKeepAlive'
import PrivateNotes from './PrivateNotes'

// deskのprivate(非公開メモ、2026-08-16 Andy指定)。スティッキーズの置き換え。
//
// 放送卓(/desk)とは**別のルート**にしてある。同じ画面に同居させると、
// 中継へ流す経路(onRawChange→WebSocket)と隣り合わせになり、いつか事故になる。
// ここには中継への配線が最初から無い=構造で「漏れない」を担保する。
export default async function DeskPrivatePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // 初期表示分はサーバーで引く(テーブル未作成でも画面は開ける)
  const { data } = await supabase
    .from('desk_private_notes')
    .select('id, html, sort_order, updated_at')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  return (
    <>
      <SessionKeepAlive />
      <PrivateNotes initial={data ?? []} />
    </>
  )
}
