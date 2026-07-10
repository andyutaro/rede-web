import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ArticleForm from '../ArticleForm'

export const dynamic = 'force-dynamic'

export default async function EditArticle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: a } = await supabase
    .from('articles')
    .select('id, title, html, type, status, tags, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (!a) notFound()

  return (
    <ArticleForm
      article={{
        id: a.id as string,
        title: (a.title as string) ?? '',
        html: (a.html as string) ?? '',
        type: a.type as 'article' | 'photography',
        status: a.status as 'draft' | 'published',
        tags: (a.tags as string[]) ?? [],
        updatedAt: (a.updated_at as string) ?? null,
      }}
    />
  )
}
