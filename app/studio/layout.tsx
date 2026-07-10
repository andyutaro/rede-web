import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import StudioNav from './StudioNav'
import './studio.css'

export const metadata: Metadata = {
  title: 'Studio — REDE',
  robots: { index: false, follow: false },
}

// 編集室 /studio: 放送卓(/desk)と対になる管理画面。認証は同じSupabaseセッション。
// proxyでも守っているが、Server Component直接到達への二重の保険(deskと同方式)。
export default async function StudioLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="studio">
      <header className="studio-bar">
        <span className="studio-mark">REDE STUDIO</span>
        <StudioNav />
        <div className="studio-bar-right">
          <Link href="/desk">放送卓へ</Link>
          <Link href="/" target="_blank">
            サイトを見る
          </Link>
        </div>
      </header>
      <main className="studio-main">{children}</main>
    </div>
  )
}
