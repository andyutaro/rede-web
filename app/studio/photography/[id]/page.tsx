import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ArticleForm from '../../articles/ArticleForm'

export const dynamic = 'force-dynamic'

export default async function EditPhotography({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: a } = await supabase
    .from('articles')
    .select('id, title, html, type, status, tags, updated_at, deleted_at')
    .eq('id', id)
    .maybeSingle()
  if (!a || a.deleted_at) notFound() // ゴミ箱内は編集不可(TRASHタブから戻す)
  // articleはArticles室で編集する(部屋違いのURL救済)
  if (a.type !== 'photography') redirect(`/studio/articles/${id}`)

  return (
    <ArticleForm
      fixedType="photography"
      basePath="/studio/photography"
      article={{
        id: a.id as string,
        title: (a.title as string) ?? '',
        html: (a.html as string) ?? '',
        status: a.status as 'draft' | 'published',
        tags: (a.tags as string[]) ?? [],
        updatedAt: (a.updated_at as string) ?? null,
      }}
    />
  )
}
