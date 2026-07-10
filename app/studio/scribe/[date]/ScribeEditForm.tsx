'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import HtmlEditor from '@/components/HtmlEditor'

const SAVE_DELAY = 1500

// 確定済みscribeの修正フォーム。保存は放送卓と同じ/api/scribe/save
// (楽観ロック込み)。ライブ配信には乗せない(アーカイブは確定テキスト、の原則)。
export default function ScribeEditForm({
  date,
  initialHtml,
  initialUpdatedAt,
}: {
  date: string
  initialHtml: string
  initialUpdatedAt: string | null
}) {
  const [message, setMessage] = useState('')
  const htmlRef = useRef(initialHtml)
  const baseUpdatedAtRef = useRef(initialUpdatedAt)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function doSave(rebased = false) {
    try {
      const res = await fetch('/api/scribe/save', {
        method: 'POST',
        body: JSON.stringify({
          date,
          html: htmlRef.current,
          baseUpdatedAt: baseUpdatedAtRef.current,
        }),
      })
      if (res.status === 409) {
        // 単独筆者の衝突は基点ずれ。最新に基点を合わせて一度だけ書き直す
        // (このフォームの内容を正とする)
        const { latest } = await res.json()
        if (!rebased && latest?.updated_at) {
          baseUpdatedAtRef.current = latest.updated_at
          await doSave(true)
          return
        }
        setMessage('他の端末で更新されています。ページを再読み込みしてください')
        return
      }
      if (!res.ok) {
        setMessage('保存失敗')
        return
      }
      const data = await res.json()
      baseUpdatedAtRef.current = data.updatedAt
      setMessage('保存済み')
    } catch {
      setMessage('保存失敗(ネットワーク)')
    }
  }

  function schedule() {
    setMessage('・・・')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      doSave()
    }, SAVE_DELAY)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <>
      <h1 className="studio-h1">SCRIBE — {date.replaceAll('-', '')}(確定済みの修正)</h1>
      <div className="studio-status-line">
        {message || (
          <Link href={`/scribe/${date}`} target="_blank">
            公開ページを見る →
          </Link>
        )}
      </div>
      <HtmlEditor
        initialHtml={initialHtml}
        onChange={(html) => {
          htmlRef.current = html
          schedule()
        }}
        onError={setMessage}
      />
    </>
  )
}
