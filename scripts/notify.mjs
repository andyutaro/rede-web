// macOSの通知を出す(2026-08-29)。
//
// **日本語をシェル越しに osascript へ渡さない。** launchdは環境変数を持たずに
// プロセスを起こすので LANG が空になり、日本語がそのまま化ける(2026-08-30に実際に
// 化けた通知が出た)。ロケールに依存しないよう、文字を**コード番号**で組み立てて
// AppleScriptを作る=経路に非ASCIIが一切出ない。
import { writeFileSync, unlinkSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [title = '', body = ''] = process.argv.slice(2)

// 文字列を AppleScript の式へ。ASCIIだけで書けるので経路の文字コードに左右されない
const toExpr = (s) => {
  const parts = [...s].map((ch) => `(character id ${ch.codePointAt(0)})`)
  return parts.length ? parts.join(' & ') : '""'
}

const script = `display notification ${toExpr(body.slice(0, 200))} with title ${toExpr(title.slice(0, 60))}`
const file = join(tmpdir(), `rede-notify-${process.pid}.applescript`)
try {
  writeFileSync(file, script, 'ascii')
  execFileSync('/usr/bin/osascript', [file], { stdio: 'ignore' })
} finally {
  try { unlinkSync(file) } catch { /* 残っても害はない */ }
}
