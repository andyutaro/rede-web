import type { Metadata } from 'next'
import Link from 'next/link'
import { showBySlug } from '@/lib/site/shows'
import { channelInfo } from '@/lib/site/podcastFeed'
import { getAboutContent, type AboutContent, type AboutShow } from '@/lib/site/about'
import Accordion from './Accordion'

// ISR: 番組カバーをRSSから引くため。文言編集は保存時にrevalidatePath('/about')で即反映
export const revalidate = 1800

export const metadata: Metadata = { title: 'About' }

async function coverMap(slugs: string[]): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    slugs.map(async (slug) => {
      const show = showBySlug(slug)
      if (!show?.feed) return [slug, null] as const
      const { image } = await channelInfo(show.feed, show.since)
      return [slug, image] as const
    })
  )
  return Object.fromEntries(entries)
}

export default async function AboutPage() {
  const c: AboutContent = await getAboutContent()
  const covers = await coverMap([...c.original, ...c.branded].map((s) => s.slug))

  return (
    <div className="measure about">
      {/* 楽章1: 導入エッセイ(署名→リード→本文→帰結) */}
      <section className="about-opening">
        <p className="about-name">{c.name}</p>
        <p className="about-lead">{c.lead}</p>
        <div className="about-prose">
          {c.intro.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        {c.coda.length > 0 && (
          <div className="about-coda">
            {c.coda.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        )}
      </section>

      {/* 楽章2: プロフィール(常時開)+概要(格納) */}
      <section className="about-movement">
        <Accordion label="PROFILE" defaultOpen>
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
      </section>

      {/* 楽章3: 番組ポートフォリオ */}
      <ShowList heading="ORIGINAL PODCASTS" shows={c.original} covers={covers} />
      <ShowList heading="BRANDED PODCASTS" shows={c.branded} covers={covers} />

      {/* 楽章4: 姿勢(STANCE) */}
      <section className="about-movement about-stance-block">
        <div className="section-head">
          <span>STANCE</span>
        </div>
        <ol className="about-stance">
          {c.stance.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </section>
    </div>
  )
}

function ShowList({
  heading,
  shows,
  covers,
}: {
  heading: string
  shows: AboutShow[]
  covers: Record<string, string | null>
}) {
  return (
    <section className="about-movement">
      <div className="section-head">
        <span>{heading}</span>
      </div>
      <div className="about-shows">
        {shows.map((s) => (
          <Link href={`/podcast/${s.slug}`} className="about-show" key={s.slug}>
            <div className="about-show-cover">
              {covers[s.slug] && (
                <div className="sq cover-frame">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={covers[s.slug]!} alt={s.name} />
                </div>
              )}
            </div>
            <div className="about-show-text">
              <div className="about-show-name">{s.name}</div>
              <p className="about-show-blurb">{s.blurb}</p>
              {s.role && (
                <p className="about-show-role">
                  <span className="role-label">担当</span>
                  {s.role}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
