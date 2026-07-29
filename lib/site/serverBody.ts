// サーバー描画用の本文フォールバック(2026-07-29)。
//
// 背景: 本文の表示はクライアントのサニタイザ(sanitizeNodes)がDOMに注入している。
// そのため**サーバーが返すHTMLには本文が1文字も入っていなかった**。
// ブラウザでは問題ないが、JSを実行しない読み手——AIクローラー・テキスト抽出・
// エージェント——には空のページに見える（実際に別のClaudeが「0字・AWAY」と誤読した）。
// robots.txtでAIクローラーを歓迎している方針とも矛盾していた。
//
// 対策: **本文のテキストをサーバー描画にも出す**。クライアントはマウント後に
// リッチ版(画像・リンク・埋め込み)へ差し替えるので、人が見る画面は変わらない。
//
// 安全性: ここは属性を一切出力せず、テキストは全てエスケープする。
// つまりXSSの余地が構造的に無い(クライアント側サニタイザのような
// ホワイトリスト判断をサーバーで再実装せずに済ませるための設計)。

const ESC: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c])
}

// 生HTML(<br>方式・div入れ子)を「行の配列」に均す。
// ブロックの境界(</div> </p> <br>)を改行に変え、残りのタグを剥がす。
function toLines(html: string): string[] {
  const text = (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/[⁠​-‍﻿]/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
  return text.split('\n').map((l) => l.trim())
}

// サーバー描画に出す本文HTML。1行=1<div>(空行も余白として保つ=Andyの書き方の要)
export function serverBodyHtml(html: string | null | undefined): string {
  const lines = toLines(html ?? '')
  if (lines.every((l) => !l)) return ''
  return lines.map((l) => `<div>${escapeHtml(l)}</div>`).join('')
}

// 表示中の文字数(空白を除く)。ライブ窓の字数カウンタの初期値をサーバーでも出すため
export function bodyCharCount(html: string | null | undefined): number {
  return toLines(html ?? '')
    .join('')
    .replace(/\s/g, '').length
}

// 「直近に書かれたか」(2026-07-29)。中継に繋がるまでの初期表示と、JSを実行しない
// 読み手のための正直な近似。接続後は中継のpresenceが上書きする。
// Date.now()はコンポーネントrenderに直接書けない(react-hooks purity)ためここに閉じる
export function isRecentlyWritten(updatedAt: string | null | undefined, withinMs = 3 * 60 * 1000): boolean {
  if (!updatedAt) return false
  const t = Date.parse(updatedAt)
  return t > 0 && Date.now() - t < withinMs
}
