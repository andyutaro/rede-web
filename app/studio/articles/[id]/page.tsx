import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ArticleForm from '../ArticleForm'
import { getTagVocabulary } from '@/lib/studio/tagVocabulary'

export const dynamic = 'force-dynamic'

export default async function EditArticle({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: a } = await supabase
    .from('articles')
    .select('id, title, html, type, status, tags, updated_at, deleted_at')
    .eq('id', id)
    .maybeSingle()
  if (!a || a.deleted_at) notFound() // ゴミ箱内は編集不可(TRASHタブから戻す)
  const tagVocabulary = await getTagVocabulary(supabase)
  // photographyは独立室で編集する(旧リンク救済)
  if (a.type === 'photography') redirect(`/studio/photography/${id}`)

  return (
    <ArticleForm
      tagVocabulary={tagVocabulary}
      fixedType="article"
      basePath="/studio/articles"
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
