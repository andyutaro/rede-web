import { createClient } from '@/lib/supabase/server'
import { getTagVocabulary } from '@/lib/studio/tagVocabulary'
import ArticleForm from '../../articles/ArticleForm'

export const dynamic = 'force-dynamic'

export default async function NewPhotography() {
  const supabase = await createClient()
  const tagVocabulary = await getTagVocabulary(supabase)
  return (
    <ArticleForm
      tagVocabulary={tagVocabulary}
      fixedType="photography"
      basePath="/studio/photography"
      article={{ id: null, title: '', html: '', status: 'draft', tags: [], updatedAt: null }}
    />
  )
}
