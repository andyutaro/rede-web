import { createClient } from '@/lib/supabase/server'
import ContactList, { type ContactRow } from './ContactList'

export const dynamic = 'force-dynamic'

// CONTACT室(2026-07-12): 問い合わせフォームの受信箱。
// 未読/全件/ゴミ箱、既読切替、2段階削除。
export default async function StudioContact() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('contact_messages')
    .select('*')
    .order('created_at', { ascending: false })

  const rows: ContactRow[] = (data ?? []).map((m) => ({
    id: m.id as string,
    name: m.name as string,
    email: m.email as string,
    topics: (m.topics as string[]) ?? [],
    message: m.message as string,
    createdAt: m.created_at as string,
    read: Boolean(m.read_at),
    deleted: Boolean(m.deleted_at),
  }))

  return (
    <>
      <h1 className="studio-h1">MAIL — 問い合わせとおたより</h1>
      <ContactList rows={rows} />
    </>
  )
}
