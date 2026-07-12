import type { Metadata } from 'next'
import { getAboutContent, type AboutContent } from '@/lib/site/about'
import Accordion from '../about/Accordion'
import ContactForm from './ContactForm'
import { INTRO, CONDITION_LINE, LONGPOST_LETTER_URL, QA_LIST } from './content'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: 'Contact' }

// Contactページ(旧andyutaro.comの受注装置を移植、2026-07-12)。
// 構成: 導入 → Q&A FOR CLIENT(全てアコーディオン格納=ミニマル維持) →
// PROFILE & OVERVIEW(Aboutと同じDB内容を再掲=単一の真実) → FORM。
// 送信はcontact_messagesに保存され、studioのCONTACT室で確認できる。
export default async function ContactPage() {
  const c: AboutContent = await getAboutContent()

  return (
    <div className="measure">
      <section className="section">
        <div className="section-head">
          <span>CONTACT</span>
        </div>
        <div className="section-body contact-intro">
          {INTRO.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {LONGPOST_LETTER_URL && (
            <p>
              Andyの一人喋りPodcast「ロングポスト」へのお便りは
              <a href={LONGPOST_LETTER_URL} target="_blank" rel="noopener noreferrer">
                こちら
              </a>
              。
            </p>
          )}
          <p className="contact-condition">{CONDITION_LINE}</p>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span>Q&amp;A FOR CLIENT</span>
        </div>
        <div className="section-body contact-qa">
          {QA_LIST.map((qa) => (
            <Accordion key={qa.q} label={qa.q}>
              <div className="about-prose about-prose-tight">
                {qa.a.map((p, i) => (
                  <p key={i} style={{ whiteSpace: 'pre-line' }}>
                    {p}
                  </p>
                ))}
              </div>
            </Accordion>
          ))}
        </div>
      </section>

      {/* PROFILE/OVERVIEWはAboutと同じ内容(site_content)を再掲する */}
      <section className="section">
        <div className="section-head">
          <span>PROFILE &amp; OVERVIEW</span>
        </div>
        <div className="section-body">
          <Accordion label="PROFILE">
            <div className="about-prose about-prose-tight">
              {c.profile.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </Accordion>
          <Accordion label="OVERVIEW">
            <div className="about-overview">
              <dl>
                <div>
                  <dt>名前</dt>
                  <dd>
                    {c.overview.nameLine}
                    {c.overview.nameNote && <span className="ov-note">{c.overview.nameNote}</span>}
                  </dd>
                </div>
                <div>
                  <dt>拠点</dt>
                  <dd>{c.overview.base}</dd>
                </div>
                <div>
                  <dt>Mail</dt>
                  <dd>
                    <a href={`mailto:${c.overview.mail}`}>{c.overview.mail}</a>
                  </dd>
                </div>
              </dl>
              <div className="ov-activities">
                {c.overview.activities.map((act, i) => (
                  <div className="ov-act" key={i}>
                    <div className="ov-act-head">{act.head}</div>
                    <ul>
                      {act.items.map((it, j) => (
                        <li key={j} className={it.sub ? 'ov-sub' : undefined}>
                          {it.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </Accordion>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <span>FORM</span>
        </div>
        <div className="section-body">
          <ContactForm />
        </div>
      </section>
    </div>
  )
}
