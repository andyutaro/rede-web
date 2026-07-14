import { createClient } from '@/lib/supabase/server'
import { createService } from '@/lib/supabase/service'

export const dynamic = 'force-dynamic'

// USAGE室: Supabase無料枠に対する現在の使用状況。
// - DB(上限500MB): studio_usage()関数(db/2026-07-11-usage.sql、要SQL実行)
// - Storage(上限1GB): scribe-mediaの全ファイルサイズを合算
// - 通信量(5GB/月)・Auth MAU等はAPIから取れないためSupabaseダッシュボード参照
const DB_LIMIT = 500 * 1024 * 1024
const STORAGE_LIMIT = 1024 * 1024 * 1024
const BUCKET = 'scribe-media'

// Cloudflare Workers無料枠(2026-07-14): リクエスト10万/日(UTC 0時リセット)。
// 超過すると当日は新規リクエストがエラーになる(勝手に課金はされない)。
// 取得にはCF_USAGE_TOKEN(Account Analytics:Read)とCF_USAGE_ACCOUNT_IDが必要。
const CF_DAILY_LIMIT = 100_000

type CfDay = { date: string; requests: number; errors: number }

async function cloudflareStats(): Promise<{ days: CfDay[] } | { setup: true } | { error: string }> {
  const token = process.env.CF_USAGE_TOKEN
  const account = process.env.CF_USAGE_ACCOUNT_ID
  if (!token || !account) return { setup: true }

  const end = new Date()
  const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000)
  const d = (x: Date) => x.toISOString().slice(0, 10)
  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `query($account: String!, $start: Date!, $end: Date!) {
          viewer { accounts(filter: { accountTag: $account }) {
            workersInvocationsAdaptive(limit: 1000, filter: { date_geq: $start, date_leq: $end }) {
              sum { requests errors }
              dimensions { date }
            }
          } }
        }`,
        variables: { account, start: d(start), end: d(end) },
      }),
      // 使用状況は5分キャッシュで十分(ページ自体はforce-dynamic)
      next: { revalidate: 300 },
    })
    const json = await res.json()
    if (json.errors?.length) return { error: json.errors[0].message as string }
    const rows = (json.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive ?? []) as {
      sum: { requests: number; errors: number }
      dimensions: { date: string }
    }[]
    // 日毎に集約(スクリプト毎に行が分かれるため)
    const byDate = new Map<string, CfDay>()
    for (const r of rows) {
      const key = r.dimensions.date
      const cur = byDate.get(key) ?? { date: key, requests: 0, errors: 0 }
      cur.requests += r.sum.requests
      cur.errors += r.sum.errors
      byDate.set(key, cur)
    }
    // 直近7日を欠損日も0で埋めて返す
    const days: CfDay[] = []
    for (let i = 6; i >= 0; i--) {
      const key = d(new Date(end.getTime() - i * 24 * 60 * 60 * 1000))
      days.push(byDate.get(key) ?? { date: key, requests: 0, errors: 0 })
    }
    return { days }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'fetch failed' }
  }
}

type TableStat = { name: string; bytes: number; rows: number }

function fmtBytes(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

async function storageStats() {
  const service = createService()
  const { data: entries, error } = await service.storage.from(BUCKET).list('', { limit: 1000 })
  if (error || !entries) return { bytes: 0, files: 0, error: true }
  let bytes = 0
  let files = 0
  for (const e of entries) {
    if (e.id !== null) {
      bytes += (e.metadata?.size as number) ?? 0
      files++
    }
  }
  const folders = entries.filter((e) => e.id === null)
  const results = await Promise.all(
    folders.map((f) => service.storage.from(BUCKET).list(f.name, { limit: 1000 }))
  )
  for (const r of results) {
    for (const f of r.data ?? []) {
      bytes += (f.metadata?.size as number) ?? 0
      files++
    }
  }
  return { bytes, files, error: false }
}

export default async function StudioUsage() {
  const supabase = await createClient()
  const [{ data: usage, error: rpcError }, storage, cf] = await Promise.all([
    supabase.rpc('studio_usage'),
    storageStats(),
    cloudflareStats(),
  ])

  const dbBytes: number | null = usage?.db_bytes ?? null
  const tables: TableStat[] = (usage?.tables as TableStat[]) ?? []

  const cfToday = 'days' in cf ? cf.days[cf.days.length - 1] : null
  const cfPeak = 'days' in cf ? Math.max(...cf.days.map((x) => x.requests), 1) : 1

  return (
    <>
      <h1 className="studio-h1">USAGE — 無料枠</h1>

      {/* Cloudflare Workers: 課金ライン(10万リクエスト/日)への近付きを常時可視化 */}
      <section className="usage-section">
        <div className="usage-head">
          <span>CLOUDFLARE WORKERS — 本日(UTC)</span>
          <span className="usage-num">
            {cfToday ? `${cfToday.requests.toLocaleString()} / ${CF_DAILY_LIMIT.toLocaleString()} req` : '—'}
          </span>
        </div>
        {'setup' in cf ? (
          <p className="studio-empty">
            未接続。Cloudflareダッシュボード → プロファイル → API Tokens で
            「Account Analytics:Read」権限のトークンを作成し、CF_USAGE_TOKEN と
            CF_USAGE_ACCOUNT_ID を環境変数(wrangler secret / Vercel)に設定してください
          </p>
        ) : 'error' in cf ? (
          <p className="studio-empty">取得できません({cf.error})</p>
        ) : (
          <>
            <UsageBar ratio={(cfToday?.requests ?? 0) / CF_DAILY_LIMIT} />
            <p className="usage-note">
              無料枠は10万リクエスト/日(UTC 0時=日本9時リセット)。超過日は新規リクエストが
              エラーになる(自動課金なし)。恒常的に近づくならWorkers Paid($5/月)へ。
            </p>
            <div className="usage-tables">
              {cf.days.map((day) => (
                <div className="usage-table-row" key={day.date}>
                  <span className="usage-table-name">{day.date}</span>
                  <span className="usage-table-rows">
                    {((day.requests / CF_DAILY_LIMIT) * 100).toFixed(1)}%
                    {day.errors > 0 ? ` / err ${day.errors}` : ''}
                  </span>
                  <span className="usage-table-bytes">
                    <span
                      className="usage-mini-bar"
                      style={{ width: `${Math.max(2, (day.requests / cfPeak) * 100)}px` }}
                    />
                    {day.requests.toLocaleString()} req
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="usage-section">
        <div className="usage-head">
          <span>SUPABASE — DATABASE</span>
          <span className="usage-num">
            {dbBytes !== null ? `${fmtBytes(dbBytes)} / ${fmtBytes(DB_LIMIT)}` : '—'}
          </span>
        </div>
        {dbBytes !== null ? (
          <UsageBar ratio={dbBytes / DB_LIMIT} />
        ) : (
          <p className="studio-empty">
            取得できません。db/2026-07-11-usage.sql(studio_usage関数)をSupabaseで実行してください
            {rpcError ? `(${rpcError.message})` : ''}
          </p>
        )}
        {tables.length > 0 && (
          <div className="usage-tables">
            {tables.map((t) => (
              <div className="usage-table-row" key={t.name}>
                <span className="usage-table-name">{t.name}</span>
                <span className="usage-table-rows">{t.rows.toLocaleString()} rows</span>
                <span className="usage-table-bytes">{fmtBytes(t.bytes)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="usage-section">
        <div className="usage-head">
          <span>SUPABASE — STORAGE({BUCKET})</span>
          <span className="usage-num">
            {storage.error ? '—' : `${fmtBytes(storage.bytes)} / ${fmtBytes(STORAGE_LIMIT)}`}
          </span>
        </div>
        {storage.error ? (
          <p className="studio-empty">取得できません</p>
        ) : (
          <>
            <UsageBar ratio={storage.bytes / STORAGE_LIMIT} />
            <p className="usage-note">{storage.files}ファイル(未参照分は毎日0:01のGCが削除)</p>
          </>
        )}
      </section>

      <section className="usage-section">
        <div className="usage-head">
          <span>その他の枠</span>
        </div>
        <p className="usage-note">
          通信量(5GB/月)・Auth MAU・Realtime等はAPIから取得できないため、
          Supabaseダッシュボードの Usage ページで確認してください。
        </p>
      </section>
    </>
  )
}

// 使用率バー。80%超で警告色、95%超で赤
function UsageBar({ ratio }: { ratio: number }) {
  const pct = Math.min(100, ratio * 100)
  const level = pct > 95 ? 'danger' : pct > 80 ? 'warn' : ''
  return (
    <div className="usage-bar" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <div className={`usage-bar-fill ${level}`} style={{ width: `${pct}%` }} />
      <span className="usage-bar-pct">{pct < 0.1 ? '0.1%未満' : `${pct.toFixed(1)}%`}</span>
    </div>
  )
}
