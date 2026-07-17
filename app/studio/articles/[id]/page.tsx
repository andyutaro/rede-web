import { redirect } from 'next/navigation'

export default async function OldEditArticle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/studio/notes/${id}`)
}
