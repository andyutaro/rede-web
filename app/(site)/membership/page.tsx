import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Membership' }

// メンバーシップ(2026-07-13、旧andyutaro.com/membershipから移植)。文言はAndyの原文まま。
// rooomの参加URLが分かり次第ROOOM_URLに入れる(未設定なら導線はテキストのみ)。
const ROOOM_URL = ''

const BENEFITS = [
  '① 自動広告のない配信の継続',
  '② 制作番組の一部、先行配信',
  '③ 不定期更新のおまけ音源や、エッセイ等',
  '④ rooom上に2つのチャットルームを設置',
]
const BENEFIT_SUB = ['(a) 番組企画・編集室', '(b) コワーキングrooom']

// THE REASON(なぜPodcastにメンバーシップが必要か)の本文段落
const REASON = [
  'まずポッドキャストは基本的にYoutubeと異なり、自動広告がありません。また私は、聴く体験を妨げる自動広告を"Enshittfication"の一つと捉えています。',
  '私にとってポッドキャストは作品です。頑張って練り上げた作品を聴いてもらえる。その瞬間に自動広告という雑音が入ってくることに抵抗感を覚えるのです。仮に「運営にかかるさまざまなコストを賄うためには仕方ないじゃないか」と言われても、です。',
  'そのため仮に今後、Spotifyなどのポッドキャスト視聴アプリで自動広告による収益化が実装されたとしても、私のオリジナル番組で有効化する意思はありません。ブランデッドポッドキャストのなかでクライアント様から強い要望があった時には有効化してしまうかもしれませんが…少なくともオリジナル番組に自動広告を入れるつもりはありません。',
  'また仮にプラットフォームが「無作為に全ポッドキャストへ広告を入れる」挙動を取り始めた場合。そのときにも「広告なし＆無料」で聴ける配信先を確保し続けるつもりです。広告のための音声 - それは例えばスポンサード案件などが考えられますが - その制作に際しても「いかに良い作品を届けられるか」を第一に活動していくというのが私のスタンスです。そして「いい作品」は制作陣とリスナーの間で生まれるものと考えています。',
  'そうして例えば「クライアントになるには予算が足りない、しかし絶対面白いポッドキャストになる」という方がいたとき。ビジネスの論理ではポッドキャストが作りにくいという場合にこそ、私達は動きまくりたいとも考えています。それがポッドキャストの特性・本質・良さに叶うと確信しており、これもメンバーシップにより成立可能な動き方です。',
  '長々と書いてしまいました。私、Andyの活動・制作姿勢に共感したり、あるいは聴取後のライトな後払いのような感覚で、活動への援護をいただけたらとても心強く思います。自動広告にわずらわされることが「誰の耳にも」起きないままに、より力強くユニークな制作活動となることをお約束します。',
]

export default function MembershipPage() {
  return (
    <div className="measure">
      <section className="section">
        <div className="section-head">
          <span>MEMBERSHIP — @andy</span>
        </div>
        <div className="section-body membership">
          <div className="about-prose about-prose-tight">
            <p>rooomで運営しているメンバーシップ。一部は無料アクセス可能な交流空間です。当面はお礼として下記を用意しております。</p>
          </div>

          <ul className="membership-benefits">
            {BENEFITS.map((b, i) => (
              <li key={i}>
                {b}
                {i === 3 && (
                  <ul className="membership-sub">
                    {BENEFIT_SUB.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>

          <div className="about-prose about-prose-tight">
            <p>
              オリジナル番組の継続（特にサカナカイギの交通費…！）やバージョンアップ、新番組の制作、そして特典ボリュームアップにつながります。自主制作・企業番組ともに、続ける上で非常に心強く思います。
            </p>
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
          <p className="about-lead">なぜPodcastにメンバーシップ制度が必要なのか。</p>
          <div className="about-prose">
            {REASON.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
            <p className="membership-note">
              メンバーシップ &quot;@andy&quot;
              は日本のメンバーシップサービス「rooom」で運営しております。ご参加いただくと、私の制作するすべてのポッドキャスト番組への援護となります。
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
