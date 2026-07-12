import { NextResponse } from 'next/server'
import { createService } from '@/lib/supabase/service'
import { TOPICS } from '@/app/(site)/contact/content'

// 問い合わせの受付(公開エンドポイント)。
// - 保存はservice role(anonの書き込みポリシーは作らない=直POSTでの荒らし面を狭める)
// - honeypot(website欄)が埋まっていたら黙って成功を返す(botに学習させない)
// - 保存が成功したらResendでメール通知(失敗しても保存は生きているので握りつぶす)
export async function POST(request: Request) {
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
  if (
    !name ||
    name.length > 100 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 200 ||
    !message ||
    message.length > 5000 ||
    topics.length > TOPICS.length ||
    topics.some((t) => !(TOPICS as readonly string[]).includes(t))
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
          subject: `【Contact】${name}さんから問い合わせ`,
          text: `名前: ${name}\nメール: ${email}\n内容: ${topics.join(' / ') || '(未選択)'}\n\n${message}\n\n--\nstudio: https://rede-web-chi.vercel.app/studio/contact`,
        }),
      })
    }
  } catch {
    // 通知失敗は無視(メッセージ自体はDBに保存済み、studioで見える)
  }

  return NextResponse.json({ ok: true })
}
