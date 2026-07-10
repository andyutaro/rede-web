import ArticleForm from '../ArticleForm'

export default function NewArticle() {
  return (
    <ArticleForm
      article={{
        id: null,
        title: '',
        html: '',
        type: 'article',
        status: 'draft',
        tags: [],
        updatedAt: null,
      }}
    />
  )
}
