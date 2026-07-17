import { redirect } from 'next/navigation'

// THUMBNAILS室はNOTES室のタブへ統合(2026-07-17)
export default function OldThumbnails() {
  redirect('/studio/notes?tab=thumbnails')
}
