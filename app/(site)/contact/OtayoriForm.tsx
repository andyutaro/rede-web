'use client'

import { useEffect, useState } from 'react'

// 番組へのおたよりフォーム(2026-07-20)。送信先は仕事の問い合わせと同じ
// /api/contact(保存はcontact_messages、studioのCONTACT室で確認)。
// 用件はtopics=[「おたより — 宛先」]で運ぶ=スキーマ変更なし。
// おたよりは継続中のオリジナル番組のみ(Andy指定。終了番組は宛先に出さない)。
// メールは任意(返信不要の便りが自然)。
// エピソードページから来た場合(?show=/?ep=)は番組の事前選択+本文への宛先焼き込み。
// 項目(topics)を持つ番組はoptgroupで「番組名 / 項目」から選ぶ(2026-07-20 Andy指定)
export type OtayoriShow = { slug: string; label: string; topics?: string[] }

export default function OtayoriForm({ shows }: { shows: OtayoriShow[] }) {
  // 選択値は宛先ラベルそのもの(「サカナカイギ」「ロングポスト / 制作」等)
  const [show, setShow] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [website, setWebsite] = useState('') // honeypot
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const s = p.get('show')
    const ep = p.get('ep')
    // 項目なし番組はラベルを直接選べる。項目持ち番組はどの項目宛かを
    // 本人に選んでもらう(こちらで推測して誤配しない)ため事前選択しない
    const target = shows.find((x) => x.slug === s && !x.topics?.length)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- マウント時1回のURL→初期値反映(SiteMenuと同前例)
    if (target) setShow(target.label)
    if (ep) setMessage((prev) => (prev ? prev : `${ep}への便り：\n\n`))
    // showsはサーバー定数(オリジナル番組リスト)で不変
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const valid = show && name.trim() && message.trim() && agreed && (!email || email.includes('@'))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || state === 'sending') return
    setState('sending')
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          topics: [`おたより — ${show}`],
          message,
          website,
        }),
      })
      if (!res.ok) throw new Error()
      setState('done')
    } catch {
      setState('error')
    }
  }

  if (state === 'done') {
    return <p className="contact-done">届きました。読んでくれてありがとうございます。</p>
  }

  return (
    <form className="contact-form" onSubmit={submit}>
      <label className="cf-field">
        <span className="cf-label">宛先 *</span>
        <select value={show} onChange={(e) => setShow(e.target.value)} required>
          <option value="">宛先を選ぶ</option>
          {shows.map((s) =>
            s.topics?.length ? (
              <optgroup key={s.slug} label={`【 ${s.label} 】`}>
                {s.topics.map((t) => (
                  <option key={t} value={`${s.label} / ${t}`}>
                    {t}
                  </option>
                ))}
              </optgroup>
            ) : (
              <option key={s.slug} value={s.label}>
                {s.label}
              </option>
            )
          )}
        </select>
      </label>
      <label className="cf-field">
        <span className="cf-label">リスナーネーム *（番組で読まれてもよい名前）</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
      </label>
      <label className="cf-field">
        <span className="cf-label">メールアドレス（任意）</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="返信が必要な場合のみ"
        />
      </label>
      <label className="cf-field">
        <span className="cf-label">おたより本文 *</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="感想・質問・話してほしいことなど"
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
      <p className="otayori-note">いただいたおたよりは、番組内で紹介することがあります。</p>
      <label className="cf-topic cf-agree">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>
          <a href="/privacy" target="_blank" rel="noopener" className="cf-privacy-link">
            プライバシーポリシー
          </a>
          に同意します
        </span>
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
