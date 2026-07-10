import { createClient } from '@/lib/supabase/server'
import TagsTable, { type TagRow } from './TagsTable'

export const dynamic = 'force-dynamic'

// TAGS室: 全タグ一覧(articles+エピソード横断)とリネーム・統合・削除。
// タグはAndyが手動付与、全コンテンツタイプ横断(確定仕様)。
export default async function StudioTags() {
  const supabase = await createClient()
  const [{ data: arts }, { data: eps }] = await Promise.all([
    supabase.from('articles').select('tags').is('deleted_at', null),
    supabase.from('episode_tags').select('tags'),
  ])

  const counts = new Map<string, { notes: number; podcast: number }>()
  for (const a of arts ?? []) {
    for (const t of (a.tags as string[]) ?? []) {
      const c = counts.get(t) ?? { notes: 0, podcast: 0 }
      c.notes++
      counts.set(t, c)
    }
  }
  for (const e of eps ?? []) {
    for (const t of (e.tags as string[]) ?? []) {
      const c = counts.get(t) ?? { notes: 0, podcast: 0 }
      c.podcast++
      counts.set(t, c)
    }
  }

  const rows: TagRow[] = [...counts.entries()]
    .map(([tag, c]) => ({ tag, notes: c.notes, podcast: c.podcast }))
    .sort((a, b) => b.notes + b.podcast - (a.notes + a.podcast) || a.tag.localeCompare(b.tag, 'ja'))

  return (
    <>
      <h1 className="studio-h1">TAGS</h1>
      <TagsTable rows={rows} />
    </>
  )
}
