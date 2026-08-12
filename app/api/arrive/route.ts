import { NextResponse } from 'next/server'
import { createService } from '@/lib/supabase/service'
import { todayInTokyo } from '@/lib/scribe/date'
import { KINDS } from '@/app/(site)/waveCreatures'

// 到着の記録(公開エンドポイント、2026-08-07)。
// サイトが開かれたときに波形へ生えた線画の種類を1つだけ残す。deskの当日ページと
// アーカイブの末尾に「今日来てくれた人」として時間順に並べるためだけのもの。
//
// 保存はservice role(anonの書き込みポリシーは作らない=直POSTの荒らし面を狭める)。
// 記録するのは日付と絵の種類だけで、誰か・どのページか・何回かは持たない。

// 簡易レート制限(IP毎, 直近60秒で10件まで)。contactと同じ方式で、
// サーバーレスはインスタンス毎メモリのため完全ではないが、
// 単一インスタンスへの連続POSTでDBが膨れるのを抑える
const RL_WINDOW_MS = 60_000
const RL_MAX = 10
const rlHits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (rlHits.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS)
  recent.push(now)
  rlHits.set(ip, recent)
  if (rlHits.size > 5000) {
    for (const [k, v] of rlHits) {
      if (v.every((t) => now - t >= RL_WINDOW_MS)) rlHits.delete(k)
    }
  }
  return recent.length > RL_MAX
}

export async function POST(request: Request) {
  // 自サイトの画面からの呼び出しだけを受ける(素のcurl・他サイト埋め込みを弾く)
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (origin && host && new URL(origin).host !== host) {
    return NextResponse.json({ ok: true }) // 黙って受け流す(botに学習させない)
  }

  const ip =
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'
  if (rateLimited(ip)) return NextResponse.json({ ok: true })

  let kind: unknown
  try {
    kind = (JSON.parse(await request.text()) as { kind?: unknown }).kind
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  if (typeof kind !== 'number' || !Number.isInteger(kind) || kind < 0 || kind >= KINDS) {
    return NextResponse.json({ error: 'invalid kind' }, { status: 400 })
  }

  const { error } = await createService()
    .from('arrivals')
    .insert({ day: todayInTokyo(), kind })
  // 記録に失敗しても画面の生きものは出ているので、呼び出し側には成功を返す
  if (error) return NextResponse.json({ ok: true })
  return NextResponse.json({ ok: true })
}
