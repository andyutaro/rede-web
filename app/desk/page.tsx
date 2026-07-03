import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { todayInTokyo } from '@/lib/scribe/date'
import DeskEditor from './DeskEditor'

export default async function DeskPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // middlewareでも守っているが、直接のServer Component到達に対する二重の保険
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
    <DeskEditor
      initialDate={date}
      initialHtml={row?.html ?? ''}
      initialUpdatedAt={row?.updated_at ?? null}
    />
  )
}
