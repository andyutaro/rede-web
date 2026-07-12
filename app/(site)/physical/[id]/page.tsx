import type { Metadata } from 'next'
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
  return { title: a?.title || 'Physical' }
}

export default async function PhysicalArticlePage({ params }: { params: Promise<Params> }) {
  const { id } = await params
  return <ArticleDetail id={id} shelf="physical" />
}
