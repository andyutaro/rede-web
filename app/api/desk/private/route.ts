import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// deskのprivate(非公開メモ)の読み書き。**認証済みのセッションでのみ動く**。
// service roleは使わない=RLSの"authenticated"ポリシーがそのまま門になる。
//
// 公開側にこのテーブルを読む経路は一つも無い(公開ページはテーブルを名指しで
// 引くので、ここに書いたものが漏れることはない)。中継にも流さない。

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function session() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user ? supabase : null
}

// 一覧(ゴミ箱を除く)。並びはsort_order
export async function GET() {
  const supabase = await session()
  if (!supabase) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('desk_private_notes')
    .select('id, html, sort_order, updated_at')
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })

  // テーブル未作成(マイグレーション未実行)でも画面を壊さない
  if (error) return NextResponse.json({ notes: [], ready: false })
  return NextResponse.json({ notes: data ?? [], ready: true })
}

// 新規作成: { } → 末尾に空のメモを1枚
export async function PUT() {
  const supabase = await session()
  if (!supabase) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // 末尾の順序値+1(空なら0)。並びは double なので後から間に挟める
  const { data: last } = await supabase
    .from('desk_private_notes')
    .select('sort_order')
    .is('deleted_at', null)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('desk_private_notes')
    .insert({ html: '', sort_order: (last?.sort_order ?? 0) + 1 })
    .select('id, html, sort_order, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ note: data })
}

// 本文の保存: { id, html }
export async function POST(request: Request) {
  const supabase = await session()
  if (!supabase) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { id?: string; html?: string }
  try {
    // beforeunloadのsendBeaconはBlobで送るのでtext()経由で読む(deskと同じ作法)
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  const { id, html } = body
  if (!id || !UUID_RE.test(id) || typeof html !== 'string') {
    return NextResponse.json({ error: 'invalid id/html' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('desk_private_notes')
    .update({ html, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('updated_at')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, updatedAt: data?.updated_at ?? null })
}

// 並び順の更新: { id, sortOrder }。sort_orderはdoubleなので、隣り合う2枚の
// 中間値を入れれば全体を振り直さずに1枚だけ動かせる
export async function PATCH(request: Request) {
  const supabase = await session()
  if (!supabase) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { id?: string; sortOrder?: number }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  const { id, sortOrder } = body
  if (!id || !UUID_RE.test(id) || typeof sortOrder !== 'number' || !Number.isFinite(sortOrder)) {
    return NextResponse.json({ error: 'invalid id/sortOrder' }, { status: 400 })
  }

  const { error } = await supabase
    .from('desk_private_notes')
    .update({ sort_order: sortOrder })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ゴミ箱へ / 復帰: { id, restore? }。書いたものは即座には消さない(他の棚と同じ)
export async function DELETE(request: Request) {
  const supabase = await session()
  if (!supabase) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: { id?: string; restore?: boolean }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  const { id, restore } = body
  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const { error } = await supabase
    .from('desk_private_notes')
    .update({ deleted_at: restore ? null : new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
