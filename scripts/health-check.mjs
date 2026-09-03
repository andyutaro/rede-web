// サイトの健康診断(2026-08-29)。日次の自動点検が読む。
//
// **なぜ作ったか。** observabilityは前から有効で、ログも溜まっていた。それでも
// 7日8,190件の「Failed to revalidate stale page」が数週間ぶん誰にも見られていなかった。
// 「見られる状態にする」と「見る」は別だった。
//
// **設計の要点。**
// - 分析API(GraphQL)の数字だけを見ない。それは実態の1/293しか映さない
//   (裏側=waitUntilの失敗はリクエストとしては成功に数えられるため)。
//   Observabilityのログを必ず併せて見る。
// - 差分ではなく**しきい値**で判定する。前回値の保存が要らず、仕組みが壊れない。
// - **アクセス数そのものは出さない**(Andyには見せない約束。月1のレビューで扱う)。
//   枠に対する割合だけを出す。
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const CF = env.CF_USAGE_TOKEN
const ACC = env.CF_USAGE_ACCOUNT_ID
const ZONE = '4188420e8d53fe598774cc7c4514390a'
const SB = env.NEXT_PUBLIC_SUPABASE_URL
const SRK = env.SUPABASE_SERVICE_ROLE_KEY

const alerts = []
const numbers = {}
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString().replace(/\.\d+Z$/, 'Z')
const DAY = 86400000

async function gql(query, variables) {
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { authorization: `Bearer ${CF}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const d = await r.json()
  if (d.errors) throw new Error(JSON.stringify(d.errors).slice(0, 200))
  return d.data
}

// Observabilityの集計を引く小道具(件数をグループ別に返す)
async function obsCount(filters, groupBy, hours = 24) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACC}/workers/observability/telemetry/query`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${CF}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        queryId: 'count',
        timeframe: { from: Date.now() - hours * 3600000, to: Date.now() },
        parameters: {
          datasets: ['cloudflare-workers'],
          filters,
          calculations: [{ operator: 'count' }],
          groupBys: [{ type: 'string', value: groupBy }],
          limit: 50,
        },
        view: 'calculations',
      }),
    }
  )
  const d = await r.json()
  if (!d.success) throw new Error(JSON.stringify(d.errors).slice(0, 160))
  return (d.result?.calculations?.[0]?.aggregates ?? []).map((a) => ({
    key: String(a.groupKey ?? ''),
    n: a.value ?? a.count ?? 0,
  }))
}

// botの見分け(2026-09-03)。名乗っているものと、名乗らないが素性で分かるもの。
// 「X11; Linux aarch64」のデスクトップChromeは実測でOracle Cloud/Hetznerの
// クローラだった(ARMのLinuxデスクトップから日本語個人サイトを読む人は事実上いない)
const BOT_UA =
  /bot|crawl|spider|slurp|GPTBot|Awario|ClaudeBot|Bytespider|facebookexternalhit|preview|monitor|curl|wget|python|Go-http|okhttp|HeadlessChrome|Lighthouse|node-fetch|axios|X11; Linux aarch64/i

// ① 失敗した呼び出しを**人とbotに分ける**(直近24時間)。
//
// **なぜ分けるか(2026-09-03 Andy指定の優先順位)。**
//   1. 人がエラー画面を見ないこと  2. システムが落ちないこと  3. botはその次。
// 分ける前は、GPTBotの巡回101件がそのまま「読者に見えた失敗101件」として
// 通知され、こちらの判断を誤らせた。同日に失敗イベント50件を1件ずつ開いて
// 素性を見たところ、**人の端末・人の回線から来たものは1件も無かった**。
// 人の件数は上限値として扱う(UAがbotでないものを全部人として数えるため)。
// 「読者に見えた失敗」とは、**待っている人の前でWorkerが死んだ**こと。
// canceled と clientDisconnected は"クライアントが去った"側の事象なので数えない
// (2026-09-03実測: プリフェッチとbotを除いた残りは canceled 1件だけで、
//  exceededCpu も exceededWallTime も0件だった。人は誰も踏んでいなかった)。
// ただし数だけは出す——サーバー側が固まってもcanceledになりうるので、
// 消してしまうと今週のような詰まりを見落とす
const DIED = ['exceededCpu', 'exceededWallTime', 'exceededMemory', 'internalError']

try {
  const rows = await obsCount(
    [
      { key: '$workers.outcome', type: 'string', operation: 'neq', value: 'ok' },
      { key: '$workers.outcome', type: 'string', operation: 'neq', value: 'canceled' },
      { key: '$workers.outcome', type: 'string', operation: 'neq', value: 'clientDisconnected' },
      // **プリフェッチは数えない(2026-09-03)。** `?_rsc=` はNext.jsが次に開きそうな
      // ページを先読みする通信で、読者が待っている画面ではない。スクロールや遷移で
      // ブラウザ側が普通に打ち切る。失敗しても読者には見えない(通常の遷移に落ちるだけ)。
      // 実測: 人らしい失敗3件は全部これで、wallは0ms/99ms/117ms=ブラウザが即座に
      // 取り消したもの。これを数えると毎日「人がエラーを見た」が鳴り続ける
      { key: '$workers.event.request.url', type: 'string', operation: 'not_includes', value: '_rsc=' },
    ],
    '$workers.event.request.headers.user-agent'
  )
  let human = 0
  let bot = 0
  const humanUa = []
  for (const { key, n } of rows) {
    if (!key || BOT_UA.test(key)) bot += n
    else {
      human += n
      humanUa.push(`${key.slice(0, 40)}(${n})`)
    }
  }
  // 参考値: 人らしいUAの canceled(クライアントが去った側)。通知はしない
  let humanCanceled = 0
  try {
    const c = await obsCount(
      [
        { key: '$workers.outcome', type: 'string', operation: 'eq', value: 'canceled' },
        { key: '$workers.event.request.url', type: 'string', operation: 'not_includes', value: '_rsc=' },
      ],
      '$workers.event.request.headers.user-agent'
    )
    for (const { key, n } of c) if (key && !BOT_UA.test(key)) humanCanceled += n
  } catch {
    humanCanceled = -1
  }

  numbers.失敗した呼び出し = {
    人の前でWorkerが死んだ: human,
    bot: bot,
    '参考_人のcanceled(去った側)': humanCanceled,
    ...(humanUa.length ? { 人の内訳: humanUa.slice(0, 5) } : {}),
  }
  // **最優先。alerts[0]が通知の本文になるので、必ず先頭に来るよう最初に押す**
  if (human > 0)
    alerts.push(
      `人の前でWorkerが死んだ: 1日${human}件(${DIED.join('/')})。最優先。素性を確認すること`
    )
  // botの失敗は原則として報せない。ただし桁が違うならシステム側の異常なので拾う
  if (bot > 1000) alerts.push(`botに返した失敗が1日${bot}件。多すぎるのでシステム側を疑う`)
} catch (e) {
  alerts.push(`失敗の内訳が取れない: ${e.message}`)
}

// ② Workersの枠の消費(直近24時間)。落ちないことの担保
try {
  const d = await gql(
    `query($a:String!,$s:Time!){viewer{accounts(filter:{accountTag:$a}){
      workersInvocationsAdaptive(limit:1000,filter:{datetime_geq:$s}){sum{requests}dimensions{status}}}}}`,
    { a: ACC, s: iso(DAY) }
  )
  const rows = d.viewer.accounts[0].workersInvocationsAdaptive
  const by = {}
  for (const r of rows) by[r.dimensions.status] = (by[r.dimensions.status] ?? 0) + r.sum.requests
  const total = Object.values(by).reduce((a, b) => a + b, 0)
  numbers.workers = {
    枠に対する割合: `${((total / 100000) * 100).toFixed(1)}%`,
    結果内訳: by,
  }
  if (total > 70000) alerts.push(`Workersのリクエストが1日10万枠の70%を超えた(${((total / 100000) * 100).toFixed(0)}%)`)
} catch (e) {
  alerts.push(`Workersの数字が取れない: ${e.message}`)
}

// ③ Observabilityのログ(直近24時間)。**ここが本体。②には出ない裏側の失敗**
try {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACC}/workers/observability/telemetry/query`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${CF}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        queryId: 'health',
        timeframe: { from: Date.now() - DAY, to: Date.now() },
        parameters: {
          datasets: ['cloudflare-workers'],
          filters: [{ key: '$metadata.error', type: 'string', operation: 'exists' }],
          calculations: [{ operator: 'count' }],
          groupBys: [{ type: 'string', value: '$metadata.message' }],
          limit: 200,
        },
        view: 'calculations',
      }),
    }
  )
  const d = await r.json()
  if (!d.success) throw new Error(JSON.stringify(d.errors).slice(0, 160))
  // 応答の形: result.calculations[0].aggregates[] に groupKey と件数が入る。
  // groupKeyはスタックトレース込みなので**1行目だけ**にまとめ直す
  // (そのままだと同じ原因が行番号違いで別々に数えられる)
  const aggs = d.result?.calculations?.[0]?.aggregates ?? []
  const rolled = new Map()
  let total = 0
  for (const a of aggs) {
    const n = a.value ?? a.count ?? 0
    total += n
    const head = String(a.groupKey ?? '?').split('\n')[0].trim().slice(0, 80)
    rolled.set(head, (rolled.get(head) ?? 0) + n)
  }
  const top = [...rolled]
    .map(([msg, n]) => ({ msg, n }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 6)
  numbers.裏側のエラー = { 合計: total, 内訳: top }
  // 2026-08-29の是正時点で日あたり約1,170件。半分の600を超えたら効いていない
  if (total > 400) alerts.push(`裏側のエラーが1日${total}件(2026-08-29の是正直後は約130件/日、是正前は約1,170件/日)。ISRの作り直しがまた失敗している可能性`)
} catch (e) {
  alerts.push(`Observabilityが読めない: ${e.message}`)
}

// ③ R2(3バケット合計・無料枠10GB)
try {
  const d = await gql(
    `query($a:String!,$s:Time!){viewer{accounts(filter:{accountTag:$a}){
      r2StorageAdaptiveGroups(limit:50,filter:{datetime_geq:$s},orderBy:[datetime_DESC]){
        max{objectCount payloadSize metadataSize}dimensions{bucketName datetime}}}}}`,
    { a: ACC, s: iso(DAY) }
  )
  const seen = new Map()
  for (const r of d.viewer.accounts[0].r2StorageAdaptiveGroups) {
    const b = r.dimensions.bucketName
    if (!seen.has(b)) seen.set(b, r.max.payloadSize + r.max.metadataSize)
  }
  const total = [...seen.values()].reduce((a, b) => a + b, 0)
  numbers.R2 = {
    合計: `${(total / 1024 ** 3).toFixed(2)}GB / 10GB`,
    内訳: Object.fromEntries([...seen].map(([k, v]) => [k, `${(v / 1024 ** 3).toFixed(2)}GB`])),
  }
  if (total > 7 * 1024 ** 3) alerts.push(`R2が10GB枠の70%を超えた(${(total / 1024 ** 3).toFixed(1)}GB)`)
} catch (e) {
  alerts.push(`R2の数字が取れない: ${e.message}`)
}

// ④ Supabase(Storageは凍結済み・Postgresは余裕。増えたら知らせる)
try {
  const r = await fetch(`${SB}/rest/v1/site_content?select=key,updated_at&key=eq.hero_queue`, {
    headers: { apikey: SRK, authorization: `Bearer ${SRK}` },
  })
  const rows = await r.json()
  const at = rows?.[0]?.updated_at
  numbers.再生キューの作り置き = at ?? '無い'
  // cronが毎晩更新する。2日以上古ければcronが止まっている
  if (!at) alerts.push('PODCASTピルの作り置きが無い(重いRSS経路に落ちている)')
  else if (Date.now() - new Date(at).getTime() > 2 * DAY)
    alerts.push(`作り置きが${Math.floor((Date.now() - new Date(at).getTime()) / DAY)}日古い。夜のcronが止まっている可能性`)
} catch (e) {
  alerts.push(`Supabaseが読めない: ${e.message}`)
}

// ⑤ 夜のcronの結果。route.tsが [cron] の行で残している。
// **ここを見ないと、控えが毎晩失敗していても気づけない**(2026-08-29の教訓:
// 戻り値はHTTPの応答として返るだけで、自動実行では誰も読まなかった)。
//
// **窓を狭く取る。** 24時間で引くと1件しかないこの行がサンプリングで落ちる
// (無料枠は1日20万イベントを超えると間引かれる。実際に0件になった)。
// cronは0:01 JST=15:01 UTC固定なので、その前後30分だけを見る。
// 手で叩いた分を拾えるよう、直近1時間も併せて探す
// 直近の 15:01 UTC(=0:01 JST)を求め、その前後30分。見つからなければ直近1時間も見る
const lastCron = (() => {
  const d = new Date()
  d.setUTCHours(15, 1, 0, 0)
  if (d.getTime() > Date.now()) d.setUTCDate(d.getUTCDate() - 1)
  return d.getTime()
})()
const windows = [
  { from: lastCron - 30 * 60000, to: lastCron + 30 * 60000 },
  { from: Date.now() - 3600000, to: Date.now() },
]
try {
  let line
  for (const win of windows) {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACC}/workers/observability/telemetry/query`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${CF}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        queryId: 'cron',
        timeframe: win,
        parameters: {
          datasets: ['cloudflare-workers'],
          filters: [{ key: '$metadata.message', type: 'string', operation: 'includes', value: '[cron]' }],
          limit: 10,
        },
        view: 'events',
      }),
    }
  )
  const d = await r.json()
  if (!d.success) throw new Error(JSON.stringify(d.errors).slice(0, 160))
  // 応答は result.events.events に入る(result.events は配列ではない)
  const ev = d.result?.events
  const events = Array.isArray(ev) ? ev : (ev?.events ?? [])
  line = events
    .map((e) => String(e?.$metadata?.message ?? ''))
    .find((m) => m.includes('[cron]'))
  if (line) break
  }
  if (!line) {
    alerts.push('夜のcronの記録が24時間ぶん無い。動いていないか、最後まで届いていない')
    numbers.夜のcron = '記録なし'
  } else {
    const res = JSON.parse(line.slice(line.indexOf('{')))
    numbers.夜のcron = {
      確定: res.target,
      控え: res.backup?.photos ?? res.backup?.error ?? '—',
      掃除: res.cleanup,
      再生キュー: res.heroQueue,
    }
    for (const [name, v] of [['控え', res.backup], ['掃除', res.cleanup], ['再生キュー', res.heroQueue]]) {
      if (v?.error) alerts.push(`夜のcronの${name}が失敗: ${String(v.error).slice(0, 90)}`)
    }
    const rest = res.backup?.photos?.remaining
    if (typeof rest === 'number' && rest > 60)
      alerts.push(`控えの未処理が${rest}件。一晩6枚では追いつかない量`)
  }
} catch (e) {
  alerts.push(`夜のcronの記録が読めない: ${e.message}`)
}

console.log(JSON.stringify({ 異常: alerts, 数字: numbers }, null, 2))
