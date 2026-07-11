'use client'

import { useEffect, useRef, useState } from 'react'
import HtmlEditor from '@/components/HtmlEditor'
import TagPicker from '../TagPicker'

const SAVE_DELAY = 1500

type Props = {
  article: {
    id: string | null
    title: string
    html: string
    status: 'draft' | 'published'
    tags: string[]
    updatedAt: string | null
    photoKind?: 'artwork' | 'photolog' // photographyの下位区分
    description?: string // 写真の小さな説明
  }
  // typeは部屋で決まる(2026-07-10: PHOTOGRAPHYを独立室に。編集画面での選択は廃止)
  fixedType: 'article' | 'photography'
  // 部屋のベースパス(/studio/articles | /studio/photography)。URL書き換えとゴミ箱後の戻り先
  basePath: string
  // 既存タグの語彙(頻度降順)。TagPickerのサジェスト源
  tagVocabulary: string[]
}

// 記事エディタの外殻: タイトル・draft/published・タグ。
// 本文はscribeと同じ共有エディタコア(HtmlEditor)。deskと同じデバウンス自動保存。
export default function ArticleForm({ article, fixedType, basePath, tagVocabulary }: Props) {
  const [title, setTitle] = useState(article.title)
  const [status, setStatus] = useState(article.status)
  // タグの付け外し・サジェストはTagPicker(共通部品)。未確定入力はrefで保存に含める
  const [tags, setTags] = useState<string[]>(article.tags)
  const tagDraftRef = useRef('')
  // photographyの区分と小さな説明(NotesのARTICLE/SCRIBE同様の下位区分、2026-07-11)
  const [photoKind, setPhotoKind] = useState<'artwork' | 'photolog'>(article.photoKind ?? 'photolog')
  const [description, setDescription] = useState(article.description ?? '')
  const [message, setMessage] = useState('')

  // 保存パイプはrefで持つ(打鍵ごとのstate更新でエディタを再レンダーしない)
  const htmlRef = useRef(article.html)
  const idRef = useRef(article.id)
  const baseUpdatedAtRef = useRef(article.updatedAt)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savingRef = useRef(false)
  // フィールドの現在値をrefにも写す(タイマー発火時に古いclosureを掴まないため)。
  // 入力中の未確定タグ(tagDraftRef)も保存に含める(確定し忘れて閉じても失わない)
  const fieldsRef = useRef({ title, status, tags, photoKind, description })
  useEffect(() => {
    fieldsRef.current = { title, status, tags, photoKind, description }
  })

  async function doSave(rebased = false) {
    if (savingRef.current) {
      schedule() // 保存中に重ねない。終わってから拾い直す
      return
    }
    savingRef.current = true
    const f = fieldsRef.current
    const tags = [...f.tags, tagDraftRef.current.trim()].filter(Boolean)
    try {
      const res = await fetch('/api/article/save', {
        method: 'POST',
        body: JSON.stringify({
          id: idRef.current,
          title: f.title,
          html: htmlRef.current,
          type: fixedType,
          status: f.status,
          tags,
          photoKind: fixedType === 'photography' ? f.photoKind : null,
          description: fixedType === 'photography' ? f.description : '',
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
        window.history.replaceState(null, '', `${basePath}/${data.id}`)
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
  }, [title, status, tags, photoKind, description])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // ゴミ箱へ(完全消去ではない。TRASHタブから戻せる)
  async function moveToTrash() {
    if (!idRef.current) return // 未保存の新規はそのまま離脱すればよい
    if (!window.confirm('この記事をゴミ箱に移動しますか？(TRASHタブから戻せます)')) return
    if (timerRef.current) clearTimeout(timerRef.current)
    try {
      const res = await fetch('/api/article/delete', {
        method: 'POST',
        body: JSON.stringify({ ids: [idRef.current], action: 'trash' }),
      })
      if (!res.ok) throw new Error()
      location.href = basePath
    } catch {
      setMessage('ゴミ箱への移動に失敗しました')
    }
  }

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
        {fixedType === 'photography' && (
          <div className="studio-kind-switch" role="radiogroup" aria-label="区分">
            {(['artwork', 'photolog'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={photoKind === k}
                className={photoKind === k ? 'active' : ''}
                onClick={() => setPhotoKind(k)}
              >
                {k.toUpperCase()}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className={`studio-publish${status === 'published' ? ' is-published' : ''}`}
          onClick={() => setStatus(status === 'published' ? 'draft' : 'published')}
        >
          {status === 'published' ? '公開中(クリックで下書きに戻す)' : '下書き(クリックで公開)'}
        </button>
        <TagPicker
          value={tags}
          onChange={setTags}
          vocabulary={tagVocabulary}
          onDraftChange={(d) => {
            tagDraftRef.current = d
          }}
        />
        <button type="button" className="studio-trash-btn" onClick={moveToTrash}>
          ゴミ箱へ
        </button>
      </div>
      {fixedType === 'photography' && (
        <textarea
          className="studio-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="説明(小さく表示されます。任意)"
          aria-label="説明"
          maxLength={500}
          rows={2}
        />
      )}
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
