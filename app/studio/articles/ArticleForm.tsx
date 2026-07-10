'use client'

import { useEffect, useRef, useState } from 'react'
import HtmlEditor from '@/components/HtmlEditor'

const SAVE_DELAY = 1500

type Props = {
  article: {
    id: string | null
    title: string
    html: string
    type: 'article' | 'photography'
    status: 'draft' | 'published'
    tags: string[]
    updatedAt: string | null
  }
}

// Articleエディタの外殻: タイトル・type・draft/published・タグ。
// 本文はscribeと同じ共有エディタコア(HtmlEditor)。deskと同じデバウンス自動保存。
export default function ArticleForm({ article }: Props) {
  const [title, setTitle] = useState(article.title)
  const [type, setType] = useState(article.type)
  const [status, setStatus] = useState(article.status)
  // タグは確定済みチップの配列+入力中の1語。半角スペース/Enterで確定し丸く囲む
  const [tags, setTags] = useState<string[]>(article.tags)
  const [tagDraft, setTagDraft] = useState('')
  const [message, setMessage] = useState('')

  // 保存パイプはrefで持つ(打鍵ごとのstate更新でエディタを再レンダーしない)
  const htmlRef = useRef(article.html)
  const idRef = useRef(article.id)
  const baseUpdatedAtRef = useRef(article.updatedAt)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  // フィールドの現在値をrefにも写す(タイマー発火時に古いclosureを掴まないため)。
  // 入力中の未確定タグ(tagDraft)も保存に含める(確定し忘れて閉じても失わない)
  const fieldsRef = useRef({ title, type, status, tags, tagDraft })
  useEffect(() => {
    fieldsRef.current = { title, type, status, tags, tagDraft }
  })

  async function doSave(rebased = false) {
    if (savingRef.current) {
      schedule() // 保存中に重ねない。終わってから拾い直す
      return
    }
    savingRef.current = true
    const f = fieldsRef.current
    const tags = [...f.tags, f.tagDraft.trim()].filter(Boolean)
    try {
      const res = await fetch('/api/article/save', {
        method: 'POST',
        body: JSON.stringify({
          id: idRef.current,
          title: f.title,
          html: htmlRef.current,
          type: f.type,
          status: f.status,
          tags,
          baseUpdatedAt: baseUpdatedAtRef.current,
        }),
      })
      if (res.status === 409) {
        // 書き手は一人なので、衝突は実質「このフォームの基点が古くなった」ケース
        // (保存の追い越し等)。最新のupdated_atに基点を合わせて一度だけ書き直す
        // (直近に身体が書いた内容=このフォームを正とする。deskのオフライン衝突と同じ哲学)
        const { latest } = await res.json()
        if (!rebased && latest?.updated_at) {
          baseUpdatedAtRef.current = latest.updated_at
          savingRef.current = false
          await doSave(true)
          return
        }
        setMessage('他の端末で更新されています。ページを再読み込みしてください')
        return
      }
      if (!res.ok) {
        setMessage('保存失敗')
        return
      }
      const data = await res.json()
      baseUpdatedAtRef.current = data.updatedAt
      if (!idRef.current && data.id) {
        idRef.current = data.id
        // URLだけ新規→編集に差し替える(リロードや戻るで二重作成しないように)。
        // router.replaceは使わない: ページ再マウント中に旧インスタンスの保存が
        // 走ると基点がずれ、以後の自動保存が全部409になるレースを踏む
        window.history.replaceState(null, '', `/studio/articles/${data.id}`)
      }
      setMessage(f.status === 'published' ? '保存済み(公開中)' : '保存済み(下書き)')
    } catch {
      setMessage('保存失敗(ネットワーク)')
    } finally {
      savingRef.current = false
    }
  }

  function schedule() {
    setMessage('・・・')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      doSave()
    }, SAVE_DELAY)
  }

  // メタフィールドの変更も自動保存に乗せる
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    schedule()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, type, status, tags])

  function commitTagDraft(draft: string) {
    const t = draft.trim()
    setTagDraft('')
    if (!t) return
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]))
  }

  function onTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // 半角スペース(またはEnter)で確定してチップ化。IME変換中のEnterは無視
    if (e.key === ' ' || (e.key === 'Enter' && !e.nativeEvent.isComposing)) {
      e.preventDefault()
      commitTagDraft(tagDraft)
      return
    }
    // 空欄でBackspace: 直前のチップを消す
    if (e.key === 'Backspace' && tagDraft === '' && tags.length > 0) {
      e.preventDefault()
      setTags((prev) => prev.slice(0, -1))
    }
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <>
      <div className="studio-status-line">{message}</div>
      <input
        className="studio-title-input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="タイトル"
        aria-label="タイトル"
      />
      <div className="studio-meta">
        <select
          className="studio-select"
          value={type}
          onChange={(e) => setType(e.target.value as 'article' | 'photography')}
          aria-label="種別"
        >
          <option value="article">ARTICLE</option>
          <option value="photography">PHOTOGRAPHY</option>
        </select>
        <button
          type="button"
          className={`studio-publish${status === 'published' ? ' is-published' : ''}`}
          onClick={() => setStatus(status === 'published' ? 'draft' : 'published')}
        >
          {status === 'published' ? '公開中(クリックで下書きに戻す)' : '下書き(クリックで公開)'}
        </button>
        <div className="studio-tag-editor" aria-label="タグ">
          {tags.map((t) => (
            <span className="studio-tag-chip" key={t}>
              {t}
              <button
                type="button"
                aria-label={`タグ ${t} を削除`}
                onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
              >
                ✕
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => {
              const v = e.target.value
              // キー入力以外(スマホの予測変換など)でスペースが入った場合もチップ化する
              if (/\s/.test(v)) {
                const parts = v.split(/\s+/)
                const rest = parts.pop() ?? ''
                parts.forEach(commitTagDraft)
                setTagDraft(rest)
              } else {
                setTagDraft(v)
              }
            }}
            onKeyDown={onTagKeyDown}
            onBlur={() => commitTagDraft(tagDraft)}
            placeholder={tags.length === 0 ? 'タグ(スペースで確定)' : ''}
          />
        </div>
      </div>
      <HtmlEditor
        initialHtml={article.html}
        onChange={(html) => {
          htmlRef.current = html
          schedule()
        }}
        onError={setMessage}
      />
    </>
  )
}
