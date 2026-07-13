// 固定ページ編集のテキスト⇔構造変換(規約)。server importを含まない=クライアントからも使える。
//   - paragraphs: 空行で段落区切り
//   - lines: 改行で1項目
//   - qa: 「---」の行でブロック区切り。各ブロックの1行目=質問、以降=回答(空行で段落)

export type QA = { q: string; a: string[] }

export function paragraphsToText(a: string[]): string {
  return a.join('\n\n')
}
export function textToParagraphs(s: string): string[] {
  return s
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
}
export function linesToText(a: string[]): string {
  return a.join('\n')
}
export function textToLines(s: string): string[] {
  return s
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}
export function qaToText(qa: QA[]): string {
  return qa.map((x) => [x.q, ...x.a].join('\n\n')).join('\n---\n')
}
export function textToQa(s: string): QA[] {
  return s
    .split(/^\s*---\s*$/m)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const paras = block
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
      const q = paras.shift() ?? ''
      return { q, a: paras }
    })
    .filter((x) => x.q)
}

// 見出し+本文のセクション列(qaと同形式: 1行目=見出し、以降=本文段落。「---」で区切り)
export type Section = { heading: string; body: string[] }
export function sectionsToText(s: Section[]): string {
  return s.map((x) => [x.heading, ...x.body].join('\n\n')).join('\n---\n')
}
export function textToSections(s: string): Section[] {
  return textToQa(s).map((x) => ({ heading: x.q, body: x.a }))
}

// フィールド種別(serializeでテキスト化、parseで構造に戻す)
export type FieldKind = 'text' | 'paragraphs' | 'lines' | 'qa' | 'sections'

export function serializeField(kind: FieldKind, value: unknown): string {
  if (kind === 'text') return typeof value === 'string' ? value : ''
  if (kind === 'lines') return linesToText((value as string[]) ?? [])
  if (kind === 'qa') return qaToText((value as QA[]) ?? [])
  if (kind === 'sections') return sectionsToText((value as Section[]) ?? [])
  return paragraphsToText((value as string[]) ?? [])
}

export function parseField(kind: FieldKind, text: string): unknown {
  if (kind === 'text') return text.trim()
  if (kind === 'lines') return textToLines(text)
  if (kind === 'qa') return textToQa(text)
  if (kind === 'sections') return textToSections(text)
  return textToParagraphs(text)
}
