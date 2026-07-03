'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// ログインは6桁コード入力を主経路にする。
// 理由: メールリンクはGmail等のセキュリティスキャナが先にアクセスして
// ワンタイムトークンを消費してしまう(otp_expired)ため構造的に不安定。
// コードはスキャナに消費されない。メール本文へのコード表示はカスタムSMTP
// (Resend)+テンプレートの {{ .Token }} で実現する。
// リンク(/auth/callback経由)も併記されたままなので、届いたリンクが
// 生きていればそちらでもログインできる。
const inputStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  color: '#e8e6e0',
  fontSize: 14,
  outline: 'none',
}

const buttonStyle: React.CSSProperties = {
  padding: '10px 14px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.14)',
  borderRadius: 8,
  color: '#e8e6e0',
  fontSize: 14,
  cursor: 'pointer',
}

export default function LoginPage() {
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'busy' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()
    setStatus('busy')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    })
    if (error) {
      // レート制限(429)はコード起因の失敗と区別して表示する。
      // 429で弾かれた試行はメール送信枠を消費しない。
      setErrorMessage(
        error.code === 'over_email_send_rate_limit' || error.status === 429
          ? 'メール送信のレート制限中です。しばらく待ってからもう一度押してください(この失敗で枠は消費されません)。'
          : `送信に失敗しました: ${error.message}`
      )
      setStatus('error')
      return
    }
    setStatus('idle')
    setStep('code')
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()
    setStatus('busy')
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({ email, token: code.trim(), type: 'email' })
    if (error) {
      setErrorMessage('コードが違うか期限切れです。')
      setStatus('error')
      return
    }
    location.href = '/desk'
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#1a1a1a',
        color: '#e8e6e0',
        fontFamily: '-apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif',
      }}
    >
      {step === 'email' ? (
        <form onSubmit={handleSendCode} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email"
            style={inputStyle}
          />
          <button type="submit" disabled={status === 'busy'} style={buttonStyle}>
            {status === 'busy' ? '送信中…' : 'ログインコードを送る'}
          </button>
          {status === 'error' && <p style={{ fontSize: 12, color: '#d96b6b' }}>{errorMessage}</p>}
        </form>
      ) : (
        <form onSubmit={handleVerifyCode} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 280 }}>
          <p style={{ fontSize: 12, color: '#6b6b6b', margin: 0 }}>
            {email} に届いたメールのコード(Your code: …)を入力してください。
          </p>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="code"
            style={{ ...inputStyle, letterSpacing: '0.2em', textAlign: 'center' }}
          />
          <button type="submit" disabled={status === 'busy'} style={buttonStyle}>
            {status === 'busy' ? '確認中…' : 'ログイン'}
          </button>
          {status === 'error' && <p style={{ fontSize: 12, color: '#d96b6b' }}>{errorMessage}</p>}
        </form>
      )}
    </main>
  )
}
