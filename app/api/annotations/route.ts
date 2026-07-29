import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createService } from '@/lib/supabase/service'

// 注釈の作成・更新・削除(2026-07-28)。
// 公開ページから直接呼ばれるが、**書けるのはログイン済みセッションだけ**。
// 判定はここ(サーバー)で行う。画面側の「編集できる見た目」は表示の都合にすぎない。
// 保存はservice role(annotationsに認証者の書き込みポリシーは作らない)。
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: {
    action?: string
    id?: string
    target?: { kind?: string; key?: string }
    blockId?: string
    startOffset?: number
    quote?: string
    body?: string
  }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const service = createService()
  const now = new Date().toISOString()

  if (body.action === 'delete') {
    if (!body.id || !UUID_RE.test(body.id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    // 消す=消す(注釈は本文の外の層なので、2段階にせず素直に消す)
    const { error } = await service.from('annotations').delete().eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const text = (body.body ?? '').trim()
  if (!text || text.length > 2000) {
    return NextResponse.json({ error: 'invalid body text' }, { status: 400 })
  }

  if (body.action === 'update') {
    if (!body.id || !UUID_RE.test(body.id)) {
      return NextResponse.json({ error: 'invalid id' }, { status: 400 })
    }
    const { error } = await service
      .from('annotations')
      .update({ body: text, updated_at: now })
      .eq('id', body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'create') {
    const kind = body.target?.kind
    const key = (body.target?.key ?? '').trim()
    const quote = (body.quote ?? '').trim()
    const blockId = (body.blockId ?? '').trim()
    if (
      (kind !== 'scribe' && kind !== 'article') ||
      !key ||
      key.length > 100 ||
      !quote ||
      quote.length > 500 ||
      blockId.length > 100
    ) {
      return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
    }
    const { error } = await service.from('annotations').insert({
      target_kind: kind,
      target_key: key,
      block_id: blockId,
      start_offset: Math.max(0, Math.floor(body.startOffset ?? 0)),
      quote,
      body: text,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
