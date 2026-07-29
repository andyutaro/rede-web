import { createClient } from '@/lib/supabase/server'
import { getTagVocabulary } from '@/lib/studio/tagVocabulary'
import ArticleForm from '../../notes/ArticleForm'

export const dynamic = 'force-dynamic'

export default async function NewEvent() {
  const supabase = await createClient()
  const tagVocabulary = await getTagVocabulary(supabase)
  return (
    <ArticleForm
      tagVocabulary={tagVocabulary}
      fixedType="event"
      basePath="/studio/events"
      article={{ id: null, title: '', html: '', status: 'draft', tags: [], updatedAt: null }}
    />
  )
}
