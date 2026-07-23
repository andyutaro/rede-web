'use client'

import { useEffect } from 'react'
import Link from 'next/link'

// 例外時の中身(2026-07-23)。それまではNextの既定画面(英語)が出ていて、
// 404を直した後もここだけ借り物のまま残っていた。
// 404と同じ静かな文法で置き、やり直す口と帰り道だけ添える。
// digestはサーバー側ログとの突き合わせ用(Workers Logsを有効にしたので追える)。
export default function ErrorBody({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    // ブラウザのコンソールとWorkers Logsの両方に痕跡を残す
    console.error(error)
  }, [error])

  return (
    <div className="measure">
      <section className="section">
        <div className="section-head">
          <span>ERROR</span>
        </div>
        <div className="section-body nf-body">
          <p className="nf-line">うまく表示できませんでした。</p>
          <p className="nf-sub">
            一時的なものかもしれません。もう一度試すか、時間をおいてお越しください。
          </p>
          <div className="nf-links">
            <button type="button" className="nf-retry" onClick={retry}>
              もう一度試す →
            </button>
            <Link href="/">Home へ →</Link>
          </div>
          {error.digest && <p className="nf-digest">{error.digest}</p>}
        </div>
      </section>
    </div>
  )
}
