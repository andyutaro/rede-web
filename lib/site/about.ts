import { createService } from '@/lib/supabase/service'

// Aboutページの編集可能コンテンツ。管理画面(/desk/about)から編集し、
// site_content(key='about')にJSONで保存する。公開/aboutはこれを読んで描画する。
// SSOTの注意: これはTiptap JSONではなく「構造フィールド+プレーン段落」方式。
// Aboutはレイアウトが決まったページのため、自由記事(Article=Tiptap)とは別扱い(司令塔承認済み方針)。
// プレーンテキストであってMarkdownではない(記法変換は一切しない)。

export type OverviewItem = { text: string; sub?: boolean }
export type OverviewActivity = { head: string; items: OverviewItem[] }
export type AboutShow = { slug: string; name: string; blurb: string; role?: string }

export type AboutContent = {
  name: string // 署名(名前)
  lead: string // 役割リード
  intro: string[] // 本文段落
  coda: string[] // 帰結(2行)
  profile: string[] // PROFILE本文段落
  overview: {
    nameLine: string
    nameNote: string
    base: string
    mail: string
    activities: OverviewActivity[]
  }
  original: AboutShow[]
  branded: AboutShow[]
  stance: string[]
}

// 現行の内容をそのままデフォルトに。DBに行が無い間はこれが表示される。
export const DEFAULT_ABOUT: AboutContent = {
  name: 'Andy（本名：安田裕太郎）',
  lead: '北海道を拠点に各地で活動しているフリーのポッドキャスターです。',
  intro: [
    'ポッドキャストとは音声メディアの一種。スマホで聴けるラジオ、でイメージしやすいかもしれません。分散的なシステム・高い心理的安全性・強い試聴維持率・低めの拡散力など、デジタルメディアの中でも変わった性質を多く備えています。',
    '新しさと古さを兼ね備え、地味ながら疲れず楽しめて、小さいチームや個人の活動も力強いものとする、すこし粘りけのあるメディア。また大掛かりなスタジオを必須とせず、機材を片手に動いて作れる軽やかなメディア。苛烈さを増すアテンションエコノミーの世界から少し距離を取り、その人達や地域・企業が持つ独自の視点や、深層的な面白さを核とできること。これがポッドキャストの面白いところだと捉えています。',
    '北海道を拠点に、宮城をはじめ全国へ機材を持って行ったりリモート収録でポッドキャストを制作する。そうして社会的意義のあるものはもちろん、規格外に大きい・小さい・あるいは珍妙なものまで『ポッドキャストだからこその面白さ』を作り出していく。',
  ],
  coda: [
    '音で編み上がる観点が、聴く人の視界をじわりと変えるようなこと。',
    'これを志向し制作してまいります。',
  ],
  profile: [
    'Andy 〔 安田裕太郎 〕',
    '1995年熊本生まれ・一橋大学卒・北海道在住。社会学部にて「民間・個人のまちづくり」を勉強し活動後、ベンチャー企業勤務を経て2021年に北海道へ移住。',
    '自然の美しさや面白さを深めて伝える活動をMIMORIとして立ち上げ後、商品開発などを経てポッドキャスト「ミモリラジオ-自然の面白さを聴く」を企画制作しサブMCとして出演。Spotify総合最高6位など一定の評価をいただく。',
    'ミモリラジオ及びMIMORIの終了後、番組ディレクションの経験を積みポッドキャスターとして活動を再開。エアラインである株式会社AIRDOのポッドキャスト「ON-AIRDO 声で旅する北海道」に出演者兼ディレクターとして携わるほか、オリジナル番組として宮城県女川町で「サカナカイギ」をリリースするなどローカル・自然・知識をベースにしたポッドキャスト制作者、出演者として活動中。',
  ],
  overview: {
    nameLine: 'Andy（安田裕太郎）',
    nameNote: '※メールでもAndyで大丈夫です。',
    base: '北海道（メイン）・宮城県・東京都など',
    mail: 'andyutaro@gmail.com',
    activities: [
      {
        head: '① ポッドキャストの企画・制作',
        items: [
          { text: '番組プロデュース' },
          { text: '番組ディレクション' },
          { text: '制作上の収録〜編集等' },
          { text: '上記活動の一貫請負', sub: true },
          { text: '上記活動の一部支援', sub: true },
        ],
      },
      {
        head: '② オリジナルポッドキャスト制作',
        items: [{ text: 'サカナカイギ等公開番組' }, { text: 'メンバーシップ限定番組' }],
      },
      {
        head: '③ ポッドキャストの派生活動',
        items: [
          { text: 'メンバーシップ運営' },
          { text: 'プロダクトの企画制作' },
          { text: '番組制作やPRへの助言' },
        ],
      },
    ],
  },
  original: [
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
  ],
  branded: [
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
  ],
  stance: [
    '音声に出来ることを探索する',
    '作品として、企画・制作する',
    '類のないニッチにこそ広がる',
    'どこでも気軽に行き制作する',
    '十年後でも聴けるものを作る',
    '規模を問わずリアルを変える',
    '探索と創作を焦らずつづける',
    'リスナーに敬意を払う',
  ],
}

// DBの保存内容はDEFAULTと浅くマージ(スキーマ追加時に既存保存が壊れないよう保険)。
export async function getAboutContent(): Promise<AboutContent> {
  try {
    const service = createService()
    const { data } = await service
      .from('site_content')
      .select('data')
      .eq('key', 'about')
      .maybeSingle()
    if (data?.data) return { ...DEFAULT_ABOUT, ...(data.data as Partial<AboutContent>) }
  } catch {
    // テーブル未作成・到達不可時はデフォルトで描画
  }
  return DEFAULT_ABOUT
}
