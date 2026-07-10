import ArticleForm from '../../articles/ArticleForm'

export default function NewPhotography() {
  return (
    <ArticleForm
      fixedType="photography"
      basePath="/studio/photography"
      article={{ id: null, title: '', html: '', status: 'draft', tags: [], updatedAt: null }}
    />
  )
}
