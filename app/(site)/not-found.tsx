import type { Metadata } from 'next'
import NotFoundBody from './NotFoundBody'

export const metadata: Metadata = { title: 'Not Found' }

// notFound()を投げた頁(存在しないエピソード・scribeの日付等)の404。
// (site)レイアウトの中に出るのでヘッダー・波形・フッターは付いたまま。
// URL自体がどこにも当たらない場合はapp/not-found.tsxが受ける
export default function NotFound() {
  return <NotFoundBody />
}
