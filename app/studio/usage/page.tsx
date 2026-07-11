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
  const [{ data: usage, error: rpcError }, storage] = await Promise.all([
    supabase.rpc('studio_usage'),
    storageStats(),
  ])

  const dbBytes: number | null = usage?.db_bytes ?? null
  const tables: TableStat[] = (usage?.tables as TableStat[]) ?? []

  return (
    <>
      <h1 className="studio-h1">USAGE — SUPABASE無料枠</h1>

      <section className="usage-section">
        <div className="usage-head">
          <span>DATABASE</span>
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
          <span>STORAGE — {BUCKET}</span>
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
