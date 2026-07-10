import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ScribeEditForm from './ScribeEditForm'

export const dynamic = 'force-dynamic'

// 確定済みscribeの修正(管理画面の担当。日々の執筆は放送卓のみ、
// 確定後の所有権は管理画面へ一方通行で引き渡し)。
export default async function EditScribe({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound()

  const supabase = await createClient()
  const { data: row } = await supabase
    .from('scribe_days')
    .select('*')
    .eq('date', date)
    .maybeSingle()
  // 未確定日は放送卓の領分。ゴミ箱内は編集不可(TRASHタブから戻す)
  if (!row || !row.finalized_at || row.deleted_at) notFound()

  return (
    <ScribeEditForm
      date={date}
      initialHtml={(row.html as string) ?? ''}
      initialUpdatedAt={(row.updated_at as string) ?? null}
    />
  )
}
