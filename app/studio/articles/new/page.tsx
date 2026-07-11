import { createClient } from '@/lib/supabase/server'
import { getTagVocabulary } from '@/lib/studio/tagVocabulary'
import ArticleForm from '../ArticleForm'

export const dynamic = 'force-dynamic'

export default async function NewArticle() {
  const supabase = await createClient()
  const tagVocabulary = await getTagVocabulary(supabase)
  return (
    <ArticleForm
      tagVocabulary={tagVocabulary}
      fixedType="article"
      basePath="/studio/articles"
      article={{ id: null, title: '', html: '', status: 'draft', tags: [], updatedAt: null }}
    />
  )
}
