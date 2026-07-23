'use client'

import { useEffect } from 'react'

// 編集室の例外境界(2026-07-23)。公開サイト側と違い、ここは道具なので
// 実用優先: 何が起きたかの手掛かり(digest)を隠さず出し、やり直す口を置く。
// この改変版Nextの再試行propは reset ではなく unstable_retry
export default function StudioError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <>
      <h1 className="studio-h1">ERROR</h1>
      <p className="studio-empty">
        処理に失敗しました。もう一度試すか、再読み込みしてください。
        {error.digest && ` (${error.digest})`}
      </p>
      <button type="button" className="bulk-btn" onClick={() => unstable_retry()}>
        もう一度試す
      </button>
    </>
  )
}
