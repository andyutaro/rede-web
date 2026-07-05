import { createClient as createServiceClient } from '@supabase/supabase-js'

// 公開サイトのサーバーコンポーネント用サービスクライアント。
// 読むのは公開コンテンツ(確定scribe・published記事・公開バケット)のみに限定すること。
// draftを返すクエリをここに書かない(status='published'の絞り込みを必ず付ける)。
export function createService() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
