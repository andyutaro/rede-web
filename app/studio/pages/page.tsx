import { redirect } from 'next/navigation'

// PAGES室はNOTES室のタブへ統合(2026-07-17)
export default function OldPages() {
  redirect('/studio/notes?tab=pages')
}
