import type { Metadata } from 'next'
import { getMembershipContent } from '@/lib/site/pages'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Membership' }

// メンバーシップ(2026-07-13、旧andyutaro.com/membershipから移植。文言はsite_content駆動=studioで編集可)。
// rooomの参加URLが分かり次第ROOOM_URLに入れる(未設定なら導線はテキストのみ)。
const ROOOM_URL = ''

export default async function MembershipPage() {
  const m = await getMembershipContent()

  return (
    <div className="measure">
      <section className="section">
        <div className="section-head">
          <span>MEMBERSHIP — @andy</span>
        </div>
        <div className="section-body membership">
          <div className="about-prose about-prose-tight">
            <p>{m.intro}</p>
          </div>

          <ul className="membership-benefits">
            {m.benefits.map((b, i) => (
              <li key={i}>
                {b}
                {i === m.benefits.length - 1 && m.sub.length > 0 && (
                  <ul className="membership-sub">
                    {m.sub.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          <div className="about-prose about-prose-tight">
            <p>{m.closing}</p>
          </div>

          {ROOOM_URL && (
            <a className="membership-cta" href={ROOOM_URL} target="_blank" rel="noopener noreferrer">
              rooomで参加する →
            </a>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span>THE REASON</span>
        </div>
        <div className="section-body">
          <p className="about-lead">{m.reasonLead}</p>
          <div className="about-prose">
            {m.reason.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <p className="membership-note">{m.note}</p>
          </div>
        </div>
      </section>
    </div>
  )
}
