import type { Metadata } from 'next'
import { getMembershipContent } from '@/lib/site/pages'
import Linkified from '../Linkified'

// ISR: 文言は/api/pages/saveのrevalidatePathで即時反映されるので毎リクエスト読まない
export const revalidate = 1800

export const metadata: Metadata = { title: 'Membership' }

// メンバーシップ(2026-07-13、旧andyutaro.com/membershipから移植。文言はsite_content駆動=studioで編集可)。
// rooomの参加ページ(2026-07-14 Andy提供)。本文は「rooomで運営」と書きながら
// 行き先が無い状態だったため、特典直後と読了地点(THE REASON末尾)の2箇所に導線を置く
const ROOOM_URL = 'https://rooom.listen.style/p/atandy'

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
            <p><Linkified text={m.intro} /></p>
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
            <p><Linkified text={m.closing} /></p>
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
              <p key={i}><Linkified text={p} /></p>
            ))}
            <p className="membership-note"><Linkified text={m.note} /></p>
          </div>
          {/* 読了地点の扉: 長文(THE REASON)を読み終えた人が冒頭へ戻らず参加できる */}
          {ROOOM_URL && (
            <a className="membership-cta" href={ROOOM_URL} target="_blank" rel="noopener noreferrer">
              rooomでメンバーシップ @andy に参加する →
            </a>
          )}
        </div>
      </section>
    </div>
  )
}
