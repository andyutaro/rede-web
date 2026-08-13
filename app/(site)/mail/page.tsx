import type { Metadata } from 'next'
import { getAboutContent, type AboutContent } from '@/lib/site/about'
import { getContactContent } from '@/lib/site/pages'
import { otayoriShows, otayoriTopicsOf } from '@/lib/site/shows'
import Accordion from '../about/Accordion'
import ContactForm from './ContactForm'
import ContactModes from './ContactModes'
import OtayoriForm, { type OtayoriShow } from './OtayoriForm'

// ISR: 文言は/api/pages/saveのrevalidatePathで即時反映されるので毎リクエスト読まない
export const revalidate = 1800

export const metadata: Metadata = {
  title: 'Contact & Otayori',
  description: 'お仕事のご相談と、番組へのおたよりの窓口。',
  alternates: { canonical: 'https://andyutaro.com/mail' },
}

// CONTACT & OTAYORIページ(2026-07-20再編、旧Contact)。
// 開いた瞬間に「仕事の相談」と「番組へのおたより」の両方が送れると分かる
// 2枚のモードタイルを冒頭に置く(最重要要件)。
// - FOR CLIENT面: 旧Contactの構成そのまま(導入→Q&A FOR CLIENT→PROFILE→FORM)。
//   文言はsite_content駆動=studioのPAGESで編集可
// - FOR LISTENER面: おたよりフォーム。宛先はオリジナル番組のみ(Andy指定)
export default async function ContactPage() {
  const [c, page]: [AboutContent, Awaited<ReturnType<typeof getContactContent>>] = await Promise.all([
    getAboutContent(),
    getContactContent(),
  ])

  // おたより宛先: 継続中のオリジナル番組のみ(終了・未配信は出さない)。
  // 全番組を【 番組名 】+項目の同じ形で出す(2026-07-25 Andy指定)。
  // 項目なし番組は既定の「自由おたより」1つに正規化される
  const otayoriTargets: OtayoriShow[] = otayoriShows().map((s) => ({
    slug: s.slug,
    label: s.shortName ?? s.name,
    topics: otayoriTopicsOf(s),
  }))

  const work = (
    <>
      <section className="section">
        <div className="section-head">
          <h2>FOR CLIENT</h2>
        </div>
        <div className="section-body contact-intro">
          {page.intro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          <p className="contact-condition">{page.condition}</p>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Q&amp;A FOR CLIENT</h2>
        </div>
        <div className="section-body contact-qa">
          {page.qa.map((qa) => (
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
          <h2>PROFILE &amp; OVERVIEW</h2>
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
          <h2>FORM</h2>
        </div>
        <div className="section-body">
          <ContactForm />
        </div>
      </section>
    </>
  )

  const otayori = (
    <>
      <section className="section">
        <div className="section-head">
          <h2>FOR LISTENER</h2>
        </div>
        <div className="section-body contact-intro">
          <p>
            オリジナル番組への感想・質問・話してほしいことを、ここから直接送れます。
            短い一言でも、とてもうれしいです。
          </p>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>OTAYORI FORM</h2>
        </div>
        <div className="section-body">
          <OtayoriForm shows={otayoriTargets} />
        </div>
      </section>
    </>
  )

  return (
    <div className="measure">
      <section className="section">
        <div className="section-head">
          <h1>CONTACT &amp; OTAYORI</h1>
        </div>
        <div className="section-body">
          <ContactModes work={work} otayori={otayori} />
        </div>
      </section>
    </div>
  )
}
