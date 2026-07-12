'use client'

import { useState } from 'react'
import { TOPICS } from './content'

// 問い合わせフォーム。送信先は/api/contact(DB保存+メール通知)。
// 彩色はサイトの原則どおり無彩色、入力欄は下線1本(検索と同じ文法)。
export default function ContactForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [topics, setTopics] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [website, setWebsite] = useState('') // honeypot(人間には見えない)
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  const valid = name.trim() && email.includes('@') && message.trim() && agreed

  function toggleTopic(t: string) {
    setTopics((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || state === 'sending') return
    setState('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        body: JSON.stringify({ name, email, topics, message, website }),
      })
      if (!res.ok) throw new Error()
      setState('done')
    } catch {
      setState('error')
    }
  }

  if (state === 'done') {
    return (
      <p className="contact-done">
        送信しました。メールにて返信いたしますので、しばらくお待ちください。
      </p>
    )
  }

  return (
    <form className="contact-form" onSubmit={submit}>
      <label className="cf-field">
        <span className="cf-label">お名前 *</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
      </label>
      <label className="cf-field">
        <span className="cf-label">メールアドレス *</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Your email address"
          required
        />
      </label>
      <div className="cf-field">
        <span className="cf-label">お問合わせ内容 *</span>
        <div className="cf-topics">
          {TOPICS.map((t) => (
            <label key={t} className="cf-topic">
              <input type="checkbox" checked={topics.includes(t)} onChange={() => toggleTopic(t)} />
              <span>{t}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="cf-field">
        <span className="cf-label">メッセージ本文 *</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Your message"
          rows={7}
          maxLength={5000}
          required
        />
      </label>
      {/* honeypot: 機械の自動入力だけが埋める欄 */}
      <input
        className="cf-hp"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        placeholder="website"
        aria-hidden="true"
      />
      <label className="cf-topic cf-agree">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>個人情報の取り扱い(返信目的での利用)に同意します</span>
      </label>
      <div className="cf-actions">
        <button type="submit" className="cf-submit" disabled={!valid || state === 'sending'}>
          {state === 'sending' ? '送信中…' : '送 信'}
        </button>
        {state === 'error' && <span className="cf-error">送信に失敗しました。時間をおいてお試しください</span>}
      </div>
    </form>
  )
}
