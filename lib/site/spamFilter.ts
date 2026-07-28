// 迷惑メール・悪意コメントの自動隔離(2026-07-27 Andy指定)。
//
// 設計の前提:
// - **消さない。隔離するだけ。** 判定は必ず間違えるので、誤判定は救出できる形にする
//   (studioのSPAMタブに残り、「スパムではない」で受信箱へ戻せる)。
//   Andyの目に入らないようにする実効部分は「メール通知を送らない」こと。
// - **ルールベース・決定的。AI判定は使わない。** 費用と外部依存が増えるうえ、
//   なぜ弾かれたか説明できない箱になる。ここは理由を必ず記録して監査可能にする。
// - **批評は通す。** 「つまらない」「期待外れ」「嫌い」等の否定的な感想は
//   正当なおたよりなので絶対に弾かない。弾くのは中身のない罵倒だけ。

export type SpamVerdict = { spam: boolean; score: number; reasons: string[] }

// 隔離のしきい値。単独で確信できる材料(スコア4以上)か、弱い材料の重なりで到達する
const THRESHOLD = 4

// 商用スパムの語彙(日本語)。単体では弱いので他の材料と重ねて効かせる
const JA_SPAM_WORDS = [
  'seo対策',
  '被リンク',
  '上位表示',
  'アクセスアップ',
  '副業',
  '在宅ワークで稼',
  '簡単に稼',
  '必ず儲',
  '不労所得',
  '高収入',
  'バイナリーオプション',
  'fx自動売買',
  '仮想通貨で',
  '暗号資産で稼',
  '投資案件',
  '融資のご案内',
  'おまとめローン',
  '債務整理',
  '出会い系',
  'アダルトサイト',
  '相互リンクのお願い',
  '格安で制作',
  '営業代行',
  'リスト販売',
]

// 商用スパムの語彙(英語)。日本語圏の個人サイトへの英文一斉送信は精度が高い
const EN_SPAM_WORDS = [
  'viagra',
  'cialis',
  'casino',
  'porn',
  'sex partner',
  'backlink',
  'seo service',
  'guest post',
  'link building',
  'crypto investment',
  'bitcoin investment',
  'forex',
  'binary option',
  'loan offer',
  'make money fast',
  'work from home',
  'dear sir/madam',
  'business proposal',
  'i am contacting you regarding your website',
  'increase your traffic',
  'boost your ranking',
]

// 中身のない罵倒だけを対象にする語(死・危害・属性攻撃)。
// 「つまらない」「最低」「嫌い」等の否定的評価は正当な感想なので入れない
const ABUSE_WORDS = [
  '死ね',
  'しね',
  '氏ね',
  '殺す',
  'ころす',
  '殺してやる',
  '消えろ',
  '失せろ',
  '黙れ',
  'きもい',
  'キモい',
  '気持ち悪い',
  'ブサイク',
  'ブス',
  'デブ',
  'カス',
  'クズ',
  'ゴミ野郎',
  '池沼',
  '知障',
  'kill yourself',
  'fuck you',
]

const URL_RE = /https?:\/\/[^\s<>"']+/gi
const CYRILLIC_RE = /[Ѐ-ӿ]/
const JA_RE = /[぀-ゟ゠-ヿ一-鿿]/

function has(hay: string, words: string[]): string[] {
  return words.filter((w) => hay.includes(w))
}

// 判定本体。純関数(テスト可能・DBに触れない)。
// duplicateは呼び出し側がDBで調べた「同一本文の既受信」フラグ
export function judgeSpam(
  input: { name: string; email: string; message: string },
  opts: { duplicate?: boolean } = {}
): SpamVerdict {
  const name = input.name ?? ''
  const message = input.message ?? ''
  const lower = `${name}\n${message}`.toLowerCase()
  const reasons: string[] = []
  let score = 0

  const links = message.match(URL_RE) ?? []
  if (links.length >= 3) {
    score += 4
    reasons.push(`リンクが${links.length}本`)
  } else if (links.length === 2) {
    score += 2
    reasons.push('リンクが2本')
  }

  const jaHits = has(lower, JA_SPAM_WORDS)
  if (jaHits.length > 0) {
    score += jaHits.length >= 2 ? 4 : 2
    reasons.push(`営業・勧誘の語: ${jaHits.slice(0, 3).join('・')}`)
  }

  const enHits = has(lower, EN_SPAM_WORDS)
  if (enHits.length > 0) {
    score += enHits.length >= 2 ? 4 : 3
    reasons.push(`英文スパムの語: ${enHits.slice(0, 3).join(', ')}`)
  }

  // 日本語が1文字もない本文 + リンク = 一斉送信の典型
  if (!JA_RE.test(message) && links.length >= 1) {
    score += 3
    reasons.push('日本語を含まない本文にリンク')
  }

  if (CYRILLIC_RE.test(message)) {
    score += 3
    reasons.push('キリル文字')
  }

  // 中身のない罵倒: 短い本文に強い攻撃語。長文中の一語では弾かない
  //(激しい言葉を含む真剣な訴えを消さないため)
  const abuseHits = has(lower, ABUSE_WORDS)
  if (abuseHits.length > 0) {
    const short = message.length < 80
    if (short || abuseHits.length >= 2) {
      score += 4
      reasons.push('中身のない罵倒')
    } else {
      score += 1
      reasons.push('攻撃的な語を含む(長文のため保留)')
    }
  }

  // 名前欄にURL = 機械投稿。人はリスナーネーム欄にURLを書かないので単独で確信できる。
  // メールアドレスの混入は「山田(a@b.com)」のような書き方もあるため弱く採る
  if (new RegExp(URL_RE.source, 'i').test(name)) {
    score += 4
    reasons.push('名前欄がURL')
  } else if (/@/.test(name)) {
    score += 2
    reasons.push('名前欄にメールアドレス')
  }

  // 本文がリンクだけ(前後の言葉がほぼない)
  const withoutLinks = message.replace(URL_RE, '').trim()
  if (links.length >= 1 && withoutLinks.length < 15) {
    score += 3
    reasons.push('本文がほぼリンクのみ')
  }

  if (opts.duplicate) {
    score += 5
    reasons.push('同一本文を受信済み')
  }

  return { spam: score >= THRESHOLD, score, reasons }
}
