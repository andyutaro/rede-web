import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { todayInTokyo } from '@/lib/scribe/date'
import DeskEditor from './DeskEditor'
import SessionKeepAlive from '../studio/SessionKeepAlive'

export default async function DeskPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // このServer Componentガードが唯一の門(旧proxy.tsはCloudflare移行で廃止、2026-07-14)
  if (!user) {
    redirect('/login')
  }

  const date = todayInTokyo()
  const { data: row } = await supabase
    .from('scribe_days')
    .select('html, updated_at')
    .eq('date', date)
    .maybeSingle()

  return (
    <>
      <SessionKeepAlive />
      <DeskEditor
        initialDate={date}
        initialHtml={row?.html ?? ''}
        initialUpdatedAt={row?.updated_at ?? null}
      />
    </>
  )
}
