import { redirect } from 'next/navigation'

// 旧ARTICLES室はNOTES室へ改名(2026-07-17)。ブックマーク救済のリダイレクト
export default async function OldArticles({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  redirect(tab ? `/studio/notes?tab=${tab}` : '/studio/notes')
}
