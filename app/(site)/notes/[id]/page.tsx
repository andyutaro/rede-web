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
  if (!a) return { title: 'Note' }
  // SNSカードにその記事の画像を出す(2026-07-23)。手動サムネイル→本文の1枚目の順
  const thumb = (a.thumbnail_url as string | null) ?? firstImageSrc((a.html as string) ?? '')
  return {
    ...ogpImage((a.title as string) || 'Note', thumb, { large: true }),
    // description: 本文の書き出し(Andy自身の言葉)から抜粋(2026-07-25)
    description: plainExcerpt((a.html as string) ?? '') || undefined,
    alternates: { canonical: `https://andyutaro.com/notes/${id}` },
  }
}

export default async function NotesArticlePage({ params }: { params: Promise<Params> }) {
  const { id } = await params
  return <ArticleDetail id={id} shelf="notes" />
}
