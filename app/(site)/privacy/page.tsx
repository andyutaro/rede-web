import type { Metadata } from 'next'
import { getPrivacyContent } from '@/lib/site/pages'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Privacy Policy' }

// プライバシーポリシー+著作権(2026-07-12。文言はsite_content駆動=studioで編集可)。
// 本文はAndy提供の原文、著作権の節はClaude起草をAndy承認。
export default async function PrivacyPage() {
  const p = await getPrivacyContent()

  return (
    <div className="measure">
      <section className="section">
        <div className="section-head">
          <span>PRIVACY POLICY</span>
        </div>
        <div className="section-body policy">
          <p>{p.intro}</p>
          {p.sections.map((s, i) => (
            <div key={i}>
              <h2>{s.heading}</h2>
              {s.body.map((b, j) => (
                <p key={j}>{b}</p>
              ))}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
