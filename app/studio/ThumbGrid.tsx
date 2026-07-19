'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { imgThumb, IMG_W } from '@/lib/site/img'

export type ThumbItem = {
  target: 'scribe' | 'article'
  id: string // scribe=date / article=uuid
  title: string
  thumb: string | null
  source: string // manual | first_image | assigned
}

const SOURCE_LABEL: Record<string, string> = {
  manual: 'MANUAL',
  first_image: 'FIRST IMAGE',
  assigned: 'ASSIGNED',
}

// サムネイル一覧+差し替え。「変更」でプール(全アップロード画像)から選ぶ。
// 「自動に戻す」は焼き込みを消す(次の表示で本文の最初の画像→充当に再決定)
export default function ThumbGrid({ items, pool }: { items: ThumbItem[]; pool: string[] }) {
  const router = useRouter()
  const [picking, setPicking] = useState<string | null>(null) // `${target}/${id}`
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function save(item: ThumbItem, url: string | null) {
    if (busy) return
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/thumbnail', {
        method: 'POST',
        body: JSON.stringify({ target: item.target, id: item.id, url }),
      })
      if (!res.ok) throw new Error()
      setPicking(null)
      router.refresh()
    } catch {
      setMessage('保存に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  if (items.length === 0) return <p className="studio-empty">対象がありません</p>

  return (
    <>
      <div className="studio-status-line">{message}</div>
      <div className="thumb-list">
        {items.map((item) => {
          const k = `${item.target}/${item.id}`
          return (
            <div key={k}>
              <div className="thumb-row">
                {item.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgThumb(item.thumb, IMG_W.pick)} alt="" loading="lazy" decoding="async" className="thumb-preview" />
                ) : (
                  <span className="thumb-preview thumb-none" />
                )}
                <div className="thumb-meta">
                  <div className="thumb-title">{item.title}</div>
                  <div className={`thumb-source ${item.source}`}>
                    {SOURCE_LABEL[item.source] ?? item.source.toUpperCase()}
                  </div>
                </div>
                <div className="thumb-actions">
                  <button
                    type="button"
                    className="bulk-btn"
                    onClick={() => setPicking(picking === k ? null : k)}
                  >
                    {picking === k ? '閉じる' : '変更'}
                  </button>
                  {item.source === 'manual' && (
                    <button type="button" className="bulk-btn" onClick={() => save(item, null)}>
                      自動に戻す
                    </button>
                  )}
                </div>
              </div>
              {picking === k && (
                <div className="thumb-picker">
                  {pool.map((url) => (
                    <button
                      key={url}
                      type="button"
                      className={`thumb-choice${item.thumb === url ? ' current' : ''}`}
                      onClick={() => save(item, url)}
                      disabled={busy}
                      aria-label="この画像にする"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imgThumb(url, IMG_W.pick)} alt="" loading="lazy" decoding="async" />
                    </button>
                  ))}
                  {pool.length === 0 && <p className="studio-empty">プールに画像がありません</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
