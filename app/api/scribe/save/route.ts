import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// 保存はユーザーのセッションに紐づくクライアントで行う(service_role keyは使わない)。
// RLSの"authenticated"ポリシーがそのまま「本人だけ書き込める」を担保する。
//
// 楽観ロック: クライアントは「自分が読み込んだ時点のupdated_at」をbaseUpdatedAtとして
// 添える。全量スナップショット上書き方式のため、これがないと複数端末で開いたとき
// 後から保存した側が相手の内容を丸ごと消す。baseが一致した場合のみ書き込み、
// 不一致(他端末が先に保存済み)なら409で最新を返してクライアントに読み直させる。
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { date?: string; html?: string; finalize?: boolean; baseUpdatedAt?: string | null }
  try {
    // beforeunloadのsendBeaconはBlobで送るため、Content-Typeがtext/plain扱いになりうる。
    // request.json()ではなくtext()経由でパースして両方のケースを吸収する。
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const { date, html, finalize, baseUpdatedAt } = body
  if (!date || typeof html !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'invalid date/html' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const patch = {
    html,
    updated_at: now,
    ...(finalize ? { finalized_at: now } : {}),
  }

  async function latestRow() {
    const { data } = await supabase
      .from('scribe_days')
      .select('html, updated_at')
      .eq('date', date!)
      .maybeSingle()
    return data ?? null
  }

  if (baseUpdatedAt) {
    // 既存行への上書き: 読み込み時点から変わっていない場合だけ通す
    const { data, error } = await supabase
      .from('scribe_days')
      .update(patch)
      .eq('date', date)
      .eq('updated_at', baseUpdatedAt)
      .select('updated_at')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'conflict', latest: await latestRow() }, { status: 409 })
    }
    return NextResponse.json({ ok: true, updatedAt: data[0].updated_at })
  }

  // 新規行(このタブは「まだ行がない」前提で開いた)。すでに他端末が作っていたら409
  const { data, error } = await supabase
    .from('scribe_days')
    .insert({ date, ...patch })
    .select('updated_at')

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'conflict', latest: await latestRow() }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, updatedAt: data[0].updated_at })
}
