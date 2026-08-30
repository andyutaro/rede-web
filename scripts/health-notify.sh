#!/bin/bash
# 日次点検の実行役(2026-08-29)。launchdが毎朝呼ぶ。
# **異常が無いときは何も出さない。** 毎日「異常なし」を出すと読まれなくなり、
# observabilityを有効にしたまま数週間見なかったのと同じ状態に戻るため。
cd /Users/andy/rede/web || exit 1
LOG="$HOME/Library/Logs/rede-health.log"
NODE=$(command -v node || echo /usr/local/bin/node)
OUT=$("$NODE" scripts/health-check.mjs 2>&1)
{ echo "=== $(date '+%Y-%m-%d %H:%M') ==="; echo "$OUT"; } >> "$LOG"

# 通知の本文は node 側で組み立てる(日本語をシェルに通さない。化けるため)
printf '%s' "$OUT" | "$NODE" -e '
let s = ""
process.stdin.on("data", (d) => (s += d)).on("end", async () => {
  let alerts
  try { alerts = JSON.parse(s)["異常"] || [] } catch { alerts = null }
  const { execFileSync } = await import("node:child_process")
  const notify = (t, b) => execFileSync(process.execPath, ["scripts/notify.mjs", t, b], { stdio: "ignore" })
  if (alerts === null) return notify("andyutaro.com 点検", "点検スクリプトが失敗しました")
  if (alerts.length === 0) return            // 異常なし=何も出さない
  notify(`andyutaro.com 点検: 異常 ${alerts.length}件`, alerts[0])
})
'
