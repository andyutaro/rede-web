'use client'

import ErrorBody from './ErrorBody'

// 公開サイトの例外境界(2026-07-23)。(site)レイアウトの中に出るので
// ヘッダー・波形・フッターは付いたまま、本文だけ差し替わる。
// この改変版Nextの再試行propは reset ではなく unstable_retry
// (node_modules/next/dist/docs .../error.md)
export default function SiteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return <ErrorBody error={error} retry={unstable_retry} />
}
