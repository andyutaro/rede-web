import { redirect } from 'next/navigation'

// PHYSICAL室(一覧)はNOTES室のタブへ統合(2026-07-17)。編集画面([id]/new)はこの配下に残る
export default async function OldPhysical({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  redirect(tab === 'trash' ? '/studio/notes?tab=trash' : '/studio/notes?tab=physical')
}
