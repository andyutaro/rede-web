import { NextResponse } from 'next/server'
import { createService } from '@/lib/supabase/service'
import { TOPICS } from '@/app/(site)/contact/content'
import { SHOWS } from '@/lib/site/shows'

// おたより(2026-07-20): topics=[「おたより — 番組名」]で仕事の問い合わせと同じ
// テーブルに載せる。宛先はオリジナル番組のみ(公開側と同じ制約をここでも守る)
const OTAYORI_TOPICS = SHOWS.filter((s) => s.group === 'original').map(
  (s) => `おたより — ${s.shortName ?? s.name}`
)

// 問い合わせの受付(公開エンドポイント)。
// - 保存はservice role(anonの書き込みポリシーは作らない=直POSTでの荒らし面を狭める)
// - honeypot(website欄)が埋まっていたら黙って成功を返す(botに学習させない)
// - IP毎の簡易レート制限で連続スパムの敷居を上げる
// - 保存が成功したらResendでメール通知(失敗しても保存は生きているので握りつぶす)

// 簡易レート制限(IP毎, 直近60秒で5件まで)。サーバーレスはインスタンス毎メモリのため
// 完全ではない(恒久対策はVercel Firewall/Upstash等)が、単一インスタンスへの
// 連続POSTの敷居を上げてDB肥大・メール枠枯渇を抑える。
const RL_WINDOW_MS = 60_000
const RL_MAX = 5
const rlHits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const recent = (rlHits.get(ip) ?? []).filter((t) => now - t < RL_WINDOW_MS)
  recent.push(now)
  rlHits.set(ip, recent)
  // メモリ肥大防止: 溜まったら期限切れキーを掃除する
  if (rlHits.size > 5000) {
    for (const [k, v] of rlHits) {
      if (v.every((t) => now - t >= RL_WINDOW_MS)) rlHits.delete(k)
    }
  }
  return recent.length > RL_MAX
}

export async function POST(request: Request) {
  const ip = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: '短時間に送信が集中しています。しばらく待ってからもう一度お試しください。' },
      { status: 429 }
    )
  }

  let body: { name?: string; email?: string; topics?: string[]; message?: string; website?: string }
  try {
    body = JSON.parse(await request.text())
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  // honeypot
  if ((body.website ?? '').trim() !== '') return NextResponse.json({ ok: true })

  const name = (body.name ?? '').trim()
  const email = (body.email ?? '').trim()
  const message = (body.message ?? '').trim()
  const topics = Array.isArray(body.topics) ? body.topics : []
  // おたより=topicsが全て「おたより — 番組名」。メールは任意(書かれていれば形式検証)
  const isOtayori = topics.length > 0 && topics.every((t) => OTAYORI_TOPICS.includes(t))
  const emailOk = isOtayori
    ? !email || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200)
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200
  if (
    !name ||
    name.length > 100 ||
    !emailOk ||
    !message ||
    message.length > 5000 ||
    topics.length > TOPICS.length ||
    (!isOtayori && topics.some((t) => !(TOPICS as readonly string[]).includes(t)))
  ) {
    return NextResponse.json({ error: 'invalid fields' }, { status: 400 })
  }

  const service = createService()
  const { error } = await service.from('contact_messages').insert({ name, email, topics, message })
  if (error) return NextResponse.json({ error: 'save failed' }, { status: 500 })

  // メール通知(best effort)。onboarding@resend.devはアカウント所有者宛のみ送れる
  try {
    if (process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: 'REDE Contact <onboarding@resend.dev>',
          to: ['andyutaro@gmail.com'],
          subject: isOtayori
            ? `【おたより】${name}さんから(${topics[0].replace('おたより — ', '')})`
            : `【Contact】${name}さんから問い合わせ`,
          text: `名前: ${name}\nメール: ${email}\n内容: ${topics.join(' / ') || '(未選択)'}\n\n${message}\n\n--\nstudio: https://andyutaro.com/studio/contact`,
        }),
      })
    }
  } catch {
    // 通知失敗は無視(メッセージ自体はDBに保存済み、studioで見える)
  }

  return NextResponse.json({ ok: true })
}
