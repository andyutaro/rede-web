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

// ① Workersの結果内訳(直近24時間)。読者に見えている失敗はここ
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
  const failed = by.exceededResources ?? 0
  numbers.workers = {
    枠に対する割合: `${((total / 100000) * 100).toFixed(1)}%`,
    読者に見えた失敗: failed,
    失敗率: total ? `${((failed / total) * 100).toFixed(3)}%` : '—',
  }
  if (total > 70000) alerts.push(`Workersのリクエストが1日10万枠の70%を超えた(${((total / 100000) * 100).toFixed(0)}%)`)
  if (failed > 100) alerts.push(`読者に見えた失敗(1102)が1日${failed}件。普段は数件`)
} catch (e) {
  alerts.push(`Workersの数字が取れない: ${e.message}`)
}

// ② Observabilityのログ(直近24時間)。**ここが本体。①には出ない裏側の失敗**
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

// ⑤ 夜のcronの結果(直近24時間)。route.tsが [cron] の行で残している。
// **ここを見ないと、控えが毎晩失敗していても気づけない**(2026-08-29の教訓:
// 戻り値はHTTPの応答として返るだけで、自動実行では誰も読まなかった)
try {
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACC}/workers/observability/telemetry/query`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${CF}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        queryId: 'cron',
        timeframe: { from: Date.now() - DAY, to: Date.now() },
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
  let events = d.result?.events ?? []
  if (!Array.isArray(events)) events = events.events ?? []
  const line = events
    .map((e) => String(e?.$metadata?.message ?? ''))
    .find((m) => m.includes('[cron]'))
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
