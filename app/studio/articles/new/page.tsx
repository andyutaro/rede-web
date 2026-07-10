import ArticleForm from '../ArticleForm'

export default function NewArticle() {
  return (
    <ArticleForm
      fixedType="article"
      basePath="/studio/articles"
      article={{ id: null, title: '', html: '', status: 'draft', tags: [], updatedAt: null }}
    />
  )
}
