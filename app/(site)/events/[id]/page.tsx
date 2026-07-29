import type { Metadata } from 'next'
import { ogpImage } from '@/lib/site/ogp'
import { firstImageSrc, plainExcerpt } from '@/lib/site/text'
import ArticleDetail, { loadPublishedArticle } from '../../ArticleDetail'

export const dynamic = 'force-dynamic'

type Params = { id: string }

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>
}): Promise<Metadata> {
  const { id } = await params
  const a = await loadPublishedArticle(id)
  if (!a) return { title: 'Events' }
  const thumb = (a.thumbnail_url as string | null) ?? firstImageSrc((a.html as string) ?? '')
  return {
    ...ogpImage((a.title as string) || 'Events', thumb, { large: true }),
    description: plainExcerpt((a.html as string) ?? '') || undefined,
    alternates: { canonical: `https://andyutaro.com/events/${id}` },
  }
}

export default async function EventArticlePage({ params }: { params: Promise<Params> }) {
  const { id } = await params
  return <ArticleDetail id={id} shelf="events" />
}
