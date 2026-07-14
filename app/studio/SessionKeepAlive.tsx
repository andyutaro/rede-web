'use client'

import { useEffect } from 'react'

// セッションの生存維持(2026-07-14)。旧proxy.tsの「毎アクセスでCookie更新」の代替。
// studio/deskを長時間開いたままでもトークンが失効しないよう、/api/auth/refreshを
// 定期(25分=アクセストークン寿命60分に余裕)+タブがフォアグラウンドに戻った時に叩く。
// 401(セッション切れ)でも何もしない(次の保存等でServer Component側ガードが/loginへ誘導)。
const INTERVAL_MS = 25 * 60 * 1000

export default function SessionKeepAlive() {
  useEffect(() => {
    const ping = () => {
      fetch('/api/auth/refresh').catch(() => {})
    }
    ping()
    const timer = setInterval(ping, INTERVAL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') ping()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return null
}
