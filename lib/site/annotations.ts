import { createService } from '@/lib/supabase/service'

// 注釈(2026-07-28)。本文とは別レイヤーで持ち、表示時にアンカーで結びつける。
// アンカーは「ブロックID + ブロック内オフセット + 引用文字列」。
// 本文が後から編集されても引用文字列で再探索できる(annotate.tsのapplyAnnotations)。
export type Annotation = {
  id: string
  blockId: string
  startOffset: number
  quote: string
  body: string
  createdAt: string
}

export type AnnotationTarget = { kind: 'scribe' | 'article'; key: string }

// 公開ページ用。テーブル未作成(SQL未実行)でも空配列で返し、本文は普通に出す
export async function loadAnnotations(target: AnnotationTarget): Promise<Annotation[]> {
  try {
    const service = createService()
    const { data, error } = await service
      .from('annotations')
      .select('id, block_id, start_offset, quote, body, created_at, deleted_at')
      .eq('target_kind', target.kind)
      .eq('target_key', target.key)
      .order('created_at', { ascending: true })
    if (error) return []
    return (data ?? [])
      .filter((a) => !a.deleted_at)
      .map((a) => ({
        id: a.id as string,
        blockId: (a.block_id as string) ?? '',
        startOffset: (a.start_offset as number) ?? 0,
        quote: (a.quote as string) ?? '',
        body: (a.body as string) ?? '',
        createdAt: (a.created_at as string) ?? '',
      }))
  } catch {
    return []
  }
}
