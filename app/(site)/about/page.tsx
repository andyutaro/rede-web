import type { Metadata } from 'next'
import Link from 'next/link'
import { SHOWS, showBySlug } from '@/lib/site/shows'
import { channelInfo } from '@/lib/site/podcastFeed'
import { getAboutContent, type AboutContent, type AboutShow } from '@/lib/site/about'
import Accordion from './Accordion'
import PlaceMap from '../PlaceMap'
import PlacesTap from './PlacesTap'
import { imgThumb, IMG_W } from '@/lib/site/img'

// 全番組の舞台を1つの点の集合に畳む(2026-07-30)。白老は3番組が共有するので
// 同じ座標は1点にまとめる=地図上で点が重なって濃くならないように。
//
// 集約地図は**日本中心**にした(Andy「東京・宮城・僕のメイン拠点の北海道が
// わかりにくいのが勿体無い。日本中心で修正して。NYを例外という扱いでいい」)。
// 世界地図では日本の4点が数ピクセルに重なって1つの団子になり、
// 「どこで作っているか」というこの節の主題が消えていた。
// ニューヨークは例外として地図から外し、下の一行と番組ページの世界地図が担う。
const ALL_PLACE_POINTS = Array.from(
  new Map(SHOWS.flatMap((s) => s.place?.points ?? []).map((p) => [`${p.lat},${p.lon}`, p])).values()
)
// 日本の点だけ(経度で切る)。地図の枠が日本なので、外の点は描いても見えない
const JAPAN_PLACE_POINTS = ALL_PLACE_POINTS.filter((p) => p.lon > 100)

// 地名 → その土地の番組名(2026-07-30)。Aboutに載っている番組だけを対象にする
// =未公開番組(ガイロン等)を地図から漏らさない。名前はshows.tsの短い方を使う
// (Aboutの表示名は副題つきで長く、小さなポップアップには入らない)
function showsByPlace(listed: { slug: string }[]): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const { slug } of listed) {
    const show = showBySlug(slug)
    if (!show?.place) continue
    const name = show.shortName ?? show.name
    for (const p of show.place.points) {
      if (!p.label) continue
      out[p.label] = [...(out[p.label] ?? []), name].filter((v, i, a) => a.indexOf(v) === i)
    }
  }
  return out
}

// ISR: 番組カバーをRSSから引くため。文言編集は保存時にrevalidatePath('/about')で即反映
export const revalidate = 1800

// description: Aboutの署名+リード(Andy自身の言葉、studio編集が即反映)から組成
export async function generateMetadata(): Promise<Metadata> {
  const c = await getAboutContent()
  return {
    title: 'About',
    description: `${c.name}。${c.lead}`,
    alternates: { canonical: 'https://andyutaro.com/about' },
  }
}

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
      <h1 className="sr-only">About</h1>
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

      {/* 楽章2: プロフィール+概要(いずれも格納、デフォルト閉=2026-07-10) */}
      <section className="about-movement">
        <Accordion label="PROFILE">
          <div className="about-prose about-prose-tight">
            {/* 署名の行にSNSアイコンを添える(2026-08-07 Andy指定)。丸い形そのものが
                「SNSではこう見えている」を語るので、説明のラベルは足さない。
                写真はpublic/に置く=Storageの母集団に入らないため、Homeのランダム写真
                にもPHOTOLOGにも決して出ない(構造で担保。フィルタを足さない) */}
            <div className="profile-head">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="profile-avatar"
                src="/profile/avatar-tsunohokori.jpg"
                alt="SNSで使っているアイコン(ツノホコリ)"
                width={192}
                height={192}
              />
              {c.profile.length > 0 && <p>{c.profile[0]}</p>}
            </div>
            {c.profile.slice(1).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            {/* 遠い近影: 顔の大写しではなく、風景の中に小さく立っている一枚 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="profile-figure"
              src="/profile/distant.jpg"
              alt="噴気の上がる山肌を背に立つAndy(遠景)"
              width={640}
              height={426}
              loading="lazy"
            />
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

      {/* 世界地図(2026-07-30 Andy指定): 番組ページが「日本のどこか」を言うのに対し、
          Aboutは全番組の集約として「地球のどこか」を言う。ここを通ってから
          下の一覧を読むと、各番組の「舞台」の一行が地図上の点として読める。
          点はshows.tsのplaceから引く=単一の真実(手で置き直さない) */}
      <section className="about-movement">
        <div className="section-head">
          <h2>PLACES</h2>
        </div>
        <div className="about-worldmap">
          {/* 点を押すとその土地の番組が出る(2026-07-30 Andy)。番組ページへは飛ばさない */}
          <PlacesTap shows={showsByPlace([...c.original, ...c.branded])}>
            <PlaceMap points={JAPAN_PLACE_POINTS} view="japan" width={340} labels interactive />
          </PlacesTap>
          <p className="about-worldmap-note">
            白老と女川から。ニューヨークへも、繋いで。
            <span>From Shiraoi and Onagawa. And to New York, over a call.</span>
          </p>
        </div>
      </section>

      {/* 楽章3: 番組ポートフォリオ。各エントリに番組の舞台の銘板を組み込む
          (2026-07-25 Andy指定「地名はこの一覧に落とし込む」。独立のPLACES節は廃止) */}
      <ShowList heading="ORIGINAL PODCASTS" shows={c.original} covers={covers} />
      <ShowList heading="BRANDED PODCASTS" shows={c.branded} covers={covers} />

      {/* 楽章4: 姿勢(STANCE) */}
      <section className="about-movement about-stance-block">
        <div className="section-head">
          <h2>STANCE</h2>
        </div>
        <ol className="about-stance">
          {c.stance.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </section>

      {/* 楽章5: 便り(2026-08-05)。Aboutは「入口にはならないが、来た人はよく読む」
          面なので、読み切った先に窓口を置く。それまでの終着はOVERVIEW内の
          mailto一本だけで、隔離フィルタを通らない経路に人を出していた。
          見た目は増やさない: /contactが冒頭で出すモードタイルをそのまま借りて、
          「仕事の相談」と「番組へのおたより」の両方が送れることを一目で見せる。
          右のタイルは?mode=otayoriでおたより面を開いた状態に着地する
          (ContactModesがマウント時にURLを読む既存の仕掛け) */}
      <section className="about-movement">
        <div className="section-head">
          <h2>MAIL</h2>
        </div>
        <p className="about-mail-note">お仕事のご相談も、番組へのおたよりも、ここから。</p>
        <div className="mail-modes about-mail-modes">
          <Link href="/mail" className="mail-mode">
            <span className="mm-en">FOR CLIENT</span>
            <span className="mm-ja">お仕事のご相談</span>
          </Link>
          <Link href="/mail?mode=otayori" className="mail-mode">
            <span className="mm-en">FOR LISTENER</span>
            <span className="mm-ja">番組へのおたより</span>
          </Link>
        </div>
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
        <h2>{heading}</h2>
      </div>
      <div className="about-shows">
        {shows.map((s) => (
          <Link href={`/podcast/${s.slug}`} className="about-show" key={s.slug}>
            <div className="about-show-cover">
              {covers[s.slug] && (
                <div className="sq cover-frame">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={imgThumb(covers[s.slug]!, IMG_W.tile)} alt={s.name} loading="lazy" decoding="async" />
                </div>
              )}
            </div>
            <div className="about-show-text">
              <div className="about-show-name">{s.name}</div>
              <p className="about-show-blurb">{s.blurb}</p>
              {/* 番組の舞台(2026-07-25 Andy指定「一覧に落とし込む」): 担当と同じ
                  ラベル行の文法で紹介文の下に。名前と紹介文の間に挟む初版は
                  段が増えてごちゃついたため廃止。出所はshows.tsのplace(単一の真実) */}
              {(() => {
                const place = showBySlug(s.slug)?.place
                return place ? (
                  <p className="about-show-role">
                    <span className="role-label">舞台</span>
                    {place.ja}
                    {place.note && `（${place.note}）`}
                    {/* 座標の活字は上の世界地図が担うので落とした(2026-07-30)。
                        代わりに海外の読み手が読める英語表記を添える */}
                    <span className="asp-en">{place.en}</span>
                  </p>
                ) : null
              })()}
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
