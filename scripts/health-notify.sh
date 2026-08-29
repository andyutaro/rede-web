#!/bin/bash
# 日次点検の実行役(2026-08-29)。launchdが毎朝呼ぶ。
# **異常が無いときは何も出さない。** 毎日「異常なし」を出すと読まれなくなり、
# observabilityを有効にしたまま数週間見なかったのと同じ状態に戻るため。
cd /Users/andy/rede/web || exit 1
LOG="$HOME/Library/Logs/rede-health.log"
OUT=$(/usr/bin/env node scripts/health-check.mjs 2>&1)
echo "=== $(date '+%Y-%m-%d %H:%M') ===" >> "$LOG"
echo "$OUT" >> "$LOG"
# 異常の件数を取り出す
N=$(printf '%s' "$OUT" | /usr/bin/env node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try{ console.log((JSON.parse(s)['異常']||[]).length) }catch{ console.log(-1) }
})")
if [ "$N" = "0" ]; then exit 0; fi
if [ "$N" = "-1" ]; then
  osascript -e 'display notification "点検スクリプトが失敗しました" with title "andyutaro.com 点検"'
  exit 0
fi
FIRST=$(printf '%s' "$OUT" | /usr/bin/env node -e "
let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
  try{ console.log((JSON.parse(s)['異常']||[])[0]||'') }catch{ console.log('') }
})")
osascript -e "display notification \"$(printf '%s' "$FIRST" | sed 's/"/\\\\"/g' | cut -c1-160)\" with title \"andyutaro.com 点検: 異常 ${N}件\""
