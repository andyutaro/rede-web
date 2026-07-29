import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTagVocabulary } from '@/lib/studio/tagVocabulary'
import { tokyoYmd } from '@/lib/site/text'
import ArticleForm from '../../notes/ArticleForm'
import { studioShelfPath } from '../../articleRows'

export const dynamic = 'force-dynamic'

export default async function EditEvent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: a } = await supabase.from('articles').select('*').eq('id', id).maybeSingle()
  if (!a || a.deleted_at) notFound() // ゴミ箱内は編集不可(TRASHタブから戻す)
  if (a.type !== 'event') redirect(`${studioShelfPath(a.type as string)}/${id}`)
  const tagVocabulary = await getTagVocabulary(supabase)

  return (
    <ArticleForm
      tagVocabulary={tagVocabulary}
      fixedType="event"
      basePath="/studio/events"
      article={{
        id: a.id as string,
        title: (a.title as string) ?? '',
        html: (a.html as string) ?? '',
        status: a.status as 'draft' | 'published',
        tags: (a.tags as string[]) ?? [],
        updatedAt: (a.updated_at as string) ?? null,
        description: (a.description as string) ?? '',
        // 開催日はpublished_atに入っている(東京の日付に直して欄へ戻す)
        eventDate: a.published_at ? tokyoYmd(a.published_at as string) : '',
      }}
    />
  )
}
