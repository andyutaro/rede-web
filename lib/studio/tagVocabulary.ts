import type { SupabaseClient } from '@supabase/supabase-js'

// 既存タグの語彙(使用頻度降順)。TagPickerのサジェスト源。
// 出典はarticles(ゴミ箱除く)+episode_tags — タグ体系の全域。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getTagVocabulary(supabase: SupabaseClient<any>): Promise<string[]> {
  const [{ data: arts }, { data: eps }] = await Promise.all([
    supabase.from('articles').select('tags').is('deleted_at', null),
    supabase.from('episode_tags').select('tags'),
  ])
  const counts = new Map<string, number>()
  for (const row of [...(arts ?? []), ...(eps ?? [])]) {
    for (const t of (row.tags as string[]) ?? []) {
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    .map(([tag]) => tag)
}
