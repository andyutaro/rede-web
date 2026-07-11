'use client'

import { useState } from 'react'

// タグ入力の共通部品(記事/写真/Podcast Inbox)。
// タイポと「どんなタグだったか忘れる」防止のため、既存タグの語彙からサジェストを出す:
// - 入力欄にフォーカスすると、よく使うタグ(頻度順)が候補チップで並ぶ→クリックで付く
// - 文字を打つと部分一致で絞り込まれる(確定はクリック/スペース/Enter)
// - 付け外しはチップの✕、空欄Backspaceで直前を外す
const SUGGEST_MAX = 12

type Props = {
  value: string[]
  onChange: (tags: string[]) => void
  vocabulary: string[] // 既存タグ(頻度降順)
  placeholder?: string
  // 入力中の未確定文字列の通知(ArticleFormが自動保存に含めるために使う)
  onDraftChange?: (draft: string) => void
}

export default function TagPicker({ value, onChange, vocabulary, placeholder, onDraftChange }: Props) {
  const [draft, setDraftState] = useState('')
  const [focused, setFocused] = useState(false)

  function setDraft(v: string) {
    setDraftState(v)
    onDraftChange?.(v)
  }

  function add(tag: string) {
    const t = tag.trim()
    if (!t) return
    if (!value.includes(t)) onChange([...value, t])
    setDraft('')
  }

  function remove(tag: string) {
    onChange(value.filter((x) => x !== tag))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // 半角スペース(またはEnter)で確定してチップ化。IME変換中のEnterは無視
    if (e.key === ' ' || (e.key === 'Enter' && !e.nativeEvent.isComposing)) {
      e.preventDefault()
      // 入力が既存タグの前方一致1件に絞れていたらそれを採用(タイポ防止)
      const t = draft.trim()
      if (t) {
        const hit = suggestions.length === 1 ? suggestions[0] : suggestions.find((s) => s === t)
        add(hit ?? t)
      }
      return
    }
    if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault()
      onChange(value.slice(0, -1))
    }
  }

  const q = draft.trim().toLowerCase()
  const suggestions = vocabulary
    .filter((t) => !value.includes(t))
    .filter((t) => (q ? t.toLowerCase().includes(q) : true))
    .slice(0, SUGGEST_MAX)

  return (
    <div className="tag-picker">
      <div className="studio-tag-editor" aria-label="タグ">
        {value.map((t) => (
          <span className="studio-tag-chip" key={t}>
            {t}
            <button type="button" aria-label={`タグ ${t} を削除`} onClick={() => remove(t)}>
              ✕
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            const v = e.target.value
            // キー入力以外(スマホの予測変換など)でスペースが入った場合もチップ化する
            if (/\s/.test(v)) {
              const parts = v.split(/\s+/)
              const rest = parts.pop() ?? ''
              parts.forEach(add)
              setDraft(rest)
            } else {
              setDraft(v)
            }
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            add(draft)
          }}
          placeholder={value.length === 0 ? placeholder ?? 'タグ(スペースで確定)' : ''}
        />
      </div>
      {focused && suggestions.length > 0 && (
        <div className="tag-suggest" role="listbox" aria-label="既存タグの候補">
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              className="tag-suggest-chip"
              // blurより先に発火させる(mousedownで確定しないとクリックが失われる)
              onMouseDown={(e) => {
                e.preventDefault()
                add(t)
              }}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
