'use client'

import { useState } from 'react'
import { parseField, type FieldKind } from '@/lib/site/pageText'

export type EditorField = {
  name: string
  label: string
  hint?: string
  kind: FieldKind
  value: string // 初期テキスト(server側でserializeField済み)
  rows?: number
}

// 固定ページの汎用テキストエディタ(2026-07-13)。各フィールドはテキストエリア/入力。
// 保存時にkindごとにパースして構造化JSONを組み立て、/api/pages/saveへ送る。
export default function PageEditor({ pageKey, fields }: { pageKey: string; fields: EditorField[] }) {
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.value]))
  )
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (busy) return
    setBusy(true)
    setMessage('保存中…')
    // 名前に「.」があるものは入れ子にして送る(2026-10-15。番組の place.ja /
    // platforms.spotify のように、保存先が入れ子のフィールドのため)
    const data: Record<string, unknown> = {}
    for (const f of fields) {
      const value = parseField(f.kind, texts[f.name] ?? '')
      if (!f.name.includes('.')) {
        data[f.name] = value
        continue
      }
      const [head, tail] = f.name.split('.')
      const nest = (data[head] ?? {}) as Record<string, unknown>
      nest[tail] = value
      data[head] = nest
    }
    try {
      const res = await fetch('/api/pages/save', {
        method: 'POST',
        body: JSON.stringify({ key: pageKey, data }),
      })
      if (!res.ok) throw new Error()
      setMessage('保存しました（公開ページへの反映は最大30分後）')
    } catch {
      setMessage('保存に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page-editor">
      {fields.map((f) => (
        <div className="page-field" key={f.name}>
          <label className="page-field-label" htmlFor={`f-${f.name}`}>
            {f.label}
          </label>
          {f.hint && <div className="page-field-hint">{f.hint}</div>}
          {f.kind === 'text' ? (
            <input
              id={`f-${f.name}`}
              value={texts[f.name] ?? ''}
              onChange={(e) => setTexts((t) => ({ ...t, [f.name]: e.target.value }))}
            />
          ) : (
            <textarea
              id={`f-${f.name}`}
              rows={f.rows ?? 5}
              value={texts[f.name] ?? ''}
              onChange={(e) => setTexts((t) => ({ ...t, [f.name]: e.target.value }))}
            />
          )}
        </div>
      ))}
      <div className="page-editor-actions">
        <button type="button" className="bulk-btn" onClick={save} disabled={busy}>
          保存する
        </button>
        <span className="page-editor-msg">{message}</span>
      </div>
    </div>
  )
}
