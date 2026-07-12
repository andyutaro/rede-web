import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTagVocabulary } from '@/lib/studio/tagVocabulary'
import ArticleForm from '../../articles/ArticleForm'
import { studioShelfPath } from '../../articleRows'

export const dynamic = 'force-dynamic'

export default async function EditPhysical({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: a } = await supabase.from('articles').select('*').eq('id', id).maybeSingle()
  if (!a || a.deleted_at) notFound() // ゴミ箱内は編集不可(TRASHタブから戻す)
  // 部屋違いのURLは正しい部屋へ(旧リンク救済)
  if (a.type !== 'physical') redirect(`${studioShelfPath(a.type as string)}/${id}`)
  const tagVocabulary = await getTagVocabulary(supabase)

  return (
    <ArticleForm
      tagVocabulary={tagVocabulary}
      fixedType="physical"
      basePath="/studio/physical"
      article={{
        id: a.id as string,
        title: (a.title as string) ?? '',
        html: (a.html as string) ?? '',
        status: a.status as 'draft' | 'published',
        tags: (a.tags as string[]) ?? [],
        updatedAt: (a.updated_at as string) ?? null,
        description: (a.description as string) ?? '',
      }}
    />
  )
}
