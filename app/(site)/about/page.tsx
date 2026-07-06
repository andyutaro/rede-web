import type { Metadata } from 'next'
import Link from 'next/link'
import { showBySlug } from '@/lib/site/shows'
import { channelInfo } from '@/lib/site/podcastFeed'
import Accordion from './Accordion'

// ISR: 番組カバーをRSSから引くため。テキストは手書きなので実質不変
export const revalidate = 1800

export const metadata: Metadata = { title: 'About' }

// Aboutは手書きの単ページ(旧andyutaro.com/aboutの内容を移植、トーンは開発中サイトへ)。
// Contactは独立ページにせずここに統合(OVERVIEWのMail)。長文はAccordionで格納。

// 導入エッセイ。署名(名前)→役割リード→本文→コーダ(帰結)の順。
const NAME = 'Andy（本名：安田裕太郎）'
const LEAD = '北海道を拠点に各地で活動しているフリーのポッドキャスターです。'
const INTRO = [
  'ポッドキャストとは音声メディアの一種。スマホで聴けるラジオ、でイメージしやすいかもしれません。分散的なシステム・高い心理的安全性・強い試聴維持率・低めの拡散力など、デジタルメディアの中でも変わった性質を多く備えています。',
  '新しさと古さを兼ね備え、地味ながら疲れず楽しめて、小さいチームや個人の活動も力強いものとする、すこし粘りけのあるメディア。また大掛かりなスタジオを必須とせず、機材を片手に動いて作れる軽やかなメディア。苛烈さを増すアテンションエコノミーの世界から少し距離を取り、その人達や地域・企業が持つ独自の視点や、深層的な面白さを核とできること。これがポッドキャストの面白いところだと捉えています。',
  '北海道を拠点に、宮城をはじめ全国へ機材を持って行ったりリモート収録でポッドキャストを制作する。そうして社会的意義のあるものはもちろん、規格外に大きい・小さい・あるいは珍妙なものまで『ポッドキャストだからこその面白さ』を作り出していく。',
]
// コーダ: エッセイの帰結。彩色は使わず(LIVE赤以外は使わない原則)、
// ink+字間でこの一節だけ静かに立てる
const CODA = [
  '音で編み上がる観点が、聴く人の視界をじわりと変えるようなこと。',
  'これを志向し制作してまいります。',
]

const PROFILE = [
  'Andy 〔 安田裕太郎 〕',
  '1995年熊本生まれ・一橋大学卒・北海道在住。社会学部にて「民間・個人のまちづくり」を勉強し活動後、ベンチャー企業勤務を経て2021年に北海道へ移住。',
  '自然の美しさや面白さを深めて伝える活動をMIMORIとして立ち上げ後、商品開発などを経てポッドキャスト「ミモリラジオ-自然の面白さを聴く」を企画制作しサブMCとして出演。Spotify総合最高6位など一定の評価をいただく。',
  'ミモリラジオ及びMIMORIの終了後、番組ディレクションの経験を積みポッドキャスターとして活動を再開。エアラインである株式会社AIRDOのポッドキャスト「ON-AIRDO 声で旅する北海道」に出演者兼ディレクターとして携わるほか、オリジナル番組として宮城県女川町で「サカナカイギ」をリリースするなどローカル・自然・知識をベースにしたポッドキャスト制作者、出演者として活動中。',
]

// 番組ポートフォリオ(Andy手書きの紹介文。/podcast/[slug]のRSS説明とは別のキュレーション文)
const ORIGINAL = [
  {
    slug: 'sakanakaigi',
    name: 'サカナカイギ',
    blurb:
      '宮城県女川町で自主制作。アングラー（釣り人）・漁師・Podcasterなど「サカナに関わる人」が繰り広げる即興クロストーク。それぞれの視点からサカナが面白く照らし出されるポッドキャストです。Spotify Inspiring Voiceに選出。',
  },
  {
    slug: 'mimoriradio',
    name: 'ミモリラジオ-自然の面白さを聴く',
    blurb:
      '北海道白老町で自主制作。自然界から一つのテーマをピックアップし、その面白さを深ぼる番組です。Spotify総合最高6位・Apple Podcasts総合最高6位。115話で完結し全話無料公開。',
  },
  {
    slug: 'longpost',
    name: 'ロングポスト',
    blurb:
      'ポッドキャストをSNSとして使ってみる。このようなことをテーマとしてInstagram（ @andyutaro ）の投稿文字数2200字には収まりきらない近況報告・おしらせ・考え事・ゲストとのトークをリリースしています。',
  },
]

const BRANDED = [
  {
    slug: 'onairdo',
    name: 'ON-AIRDO 声で旅する北海道',
    blurb:
      '「北海道の翼」AIRDO公式ポッドキャスト。広い北海道に溢れる、機内誌には載せきれないようなニッチな面白さを、AIRDO社員自らがトークする番組です。おたよりに集まるニッチな北海道の面白さ・おいしさは必聴です。',
    role: 'ディレクター兼サブMCとして、出演を含め番組制作上のほぼ全てに立ち上げから対応。',
  },
  {
    slug: 'brandshift',
    name: 'Brand Shift 〜だれも教えてくれない経営とブランドの話〜',
    blurb:
      'ブランドとは経営戦略の中核である――。グローバルイノベーションファーム「I&CO」共同創業パートナーのレイ・イナモト氏とAPAC COOの間澤崇氏が、時代によって変わりゆく「ブランドの概念」を経営の視点から捉え直す番組です。',
    role: 'ディレクターとしてChronicleチームに参画し立ち上げから対応。',
  },
]

const STANCE = [
  '音声に出来ることを探索する',
  '作品として、企画・制作する',
  '類のないニッチにこそ広がる',
  'どこでも気軽に行き制作する',
  '十年後でも聴けるものを作る',
  '規模を問わずリアルを変える',
  '探索と創作を焦らずつづける',
  'リスナーに敬意を払う',
]

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
  const covers = await coverMap([...ORIGINAL, ...BRANDED].map((s) => s.slug))

  return (
    <div className="measure about">
      {/* 楽章1: 導入エッセイ(ページの声。ラベルを置かず声から始める) */}
      <section className="about-opening">
        <p className="about-name">{NAME}</p>
        <p className="about-lead">{LEAD}</p>
        <div className="about-prose">
          {INTRO.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div className="about-coda">
          {CODA.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      {/* 楽章2: プロフィール(常時開)+概要(格納)。親ラベルは置かない */}
      <section className="about-movement">
        <Accordion label="PROFILE" defaultOpen>
          <div className="about-prose about-prose-tight">
            {PROFILE.map((p, i) => (
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
                  Andy（安田裕太郎）
                  <span className="ov-note">※メールでもAndyで大丈夫です。</span>
                </dd>
              </div>
              <div>
                <dt>拠点</dt>
                <dd>北海道（メイン）・宮城県・東京都など</dd>
              </div>
              <div>
                <dt>Mail</dt>
                <dd>
                  <a href="mailto:andyutaro@gmail.com">andyutaro@gmail.com</a>
                </dd>
              </div>
            </dl>
            <div className="ov-activities">
              <div className="ov-act">
                <div className="ov-act-head">① ポッドキャストの企画・制作</div>
                <ul>
                  <li>番組プロデュース</li>
                  <li>番組ディレクション</li>
                  <li>制作上の収録〜編集等</li>
                  <li className="ov-sub">上記活動の一貫請負</li>
                  <li className="ov-sub">上記活動の一部支援</li>
                </ul>
              </div>
              <div className="ov-act">
                <div className="ov-act-head">② オリジナルポッドキャスト制作</div>
                <ul>
                  <li>サカナカイギ等公開番組</li>
                  <li>メンバーシップ限定番組</li>
                </ul>
              </div>
              <div className="ov-act">
                <div className="ov-act-head">③ ポッドキャストの派生活動</div>
                <ul>
                  <li>メンバーシップ運営</li>
                  <li>プロダクトの企画制作</li>
                  <li>番組制作やPRへの助言</li>
                </ul>
              </div>
            </div>
          </div>
        </Accordion>
      </section>

      {/* 楽章3: 番組ポートフォリオ。カバーで文字の壁を割り、番組名は見出しとして立てる */}
      <ShowList heading="ORIGINAL PODCASTS" shows={ORIGINAL} covers={covers} />
      <ShowList heading="BRANDED PODCASTS" shows={BRANDED} covers={covers} />

      {/* 楽章4: 姿勢(STANCE) */}
      <section className="about-movement about-stance-block">
        <div className="section-head">
          <span>STANCE</span>
        </div>
        <ol className="about-stance">
          {STANCE.map((s, i) => (
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
  shows: { slug: string; name: string; blurb: string; role?: string }[]
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
