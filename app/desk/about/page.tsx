import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAboutContent } from '@/lib/site/about'
import AboutEditor from './AboutEditor'
import SessionKeepAlive from '../../studio/SessionKeepAlive'

// Aboutの文言編集画面。/deskと同じく認証必須(未ログインは/loginへ)。
export default async function DeskAboutPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const content = await getAboutContent()
  return (
    <>
      <SessionKeepAlive />
      <AboutEditor initial={content} />
    </>
  )
}
