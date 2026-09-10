'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ゲスト出演の登録(2026-09-10 Andy指定「URLを貼り付けるだけ」)。
// SpotifyのエピソードURLを貼る → サーバーが解決してプレビューを出す → 保存。
// 自動解決に失敗したときのために、RSSを直接貼る欄をフォールバックに置く。

export type GuestListRow = {
  id: string
  showName: string
  title: string
  date: string
  duration: string | null
  hasAudio: boolean
}

type Preview = {
  feedUrl: string | null
  guid: string | null
  showName: string
  title: string
  date: string
  duration: string | null
  image: string | null
  hasAudio: boolean
  rssFound: boolean
  audioHost: string | null
  audioAllowed: boolean
}

export default function GuestManager({ rows }: { rows: GuestListRow[] }) {
  const router = useRouter()
  const [url, setUrl] = useState('')
  const [feedUrl, setFeedUrl] = useState('')
  const [title, setTitle] = useState('')
  const [fallback, setFallback] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)

  const post = async (action: 'resolve' | 'save' | 'delete', extra: Record<string, unknown> = {}) => {
    const res = await fetch('/api/guest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action,
        spotifyUrl: url.trim() || undefined,
        feedUrl: feedUrl.trim() || undefined,
        title: title.trim() || undefined,
        ...extra,
      }),
    })
    const data = (await res.json().catch(() => ({}))) as {
      error?: string
      preview?: Preview
      step?: string
    }
    if (!res.ok) throw new Error(data.error || '失敗した')
    return data
  }

  const onResolve = async () => {
    setBusy(true)
    setError(null)
    setPreview(null)
    try {
      const data = await post('resolve')
      setPreview(data.preview ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : '失敗した')
      // 自動解決が転んだらRSS欄を開く(先方がSpotify独占配信の場合など)
      setFallback(true)
    } finally {
      setBusy(false)
    }
  }

  const onSave = async () => {
    setBusy(true)
    setError(null)
    try {
      await post('save')
      setUrl('')
      setFeedUrl('')
      setTitle('')
      setPreview(null)
      setFallback(false)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '失敗した')
    } finally {
      setBusy(false)
    }
  }

  const onDelete = async (id: string) => {
    setBusy(true)
    setError(null)
    try {
      await post('delete', { id })
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : '失敗した')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="guest-manager">
      <div className="guest-form">
        <label className="guest-label" htmlFor="guest-url">
          SPOTIFYのエピソードURL
        </label>
        <input
          id="guest-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://open.spotify.com/episode/..."
          spellCheck={false}
        />

        {fallback && (
          <>
            <label className="guest-label" htmlFor="guest-feed">
              RSSのURL（自動で見つからないとき）
            </label>
            <input
              id="guest-feed"
              type="url"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="https://anchor.fm/s/xxxxxxxx/podcast/rss"
              spellCheck={false}
            />
            <label className="guest-label" htmlFor="guest-title">
              回名（RSSの中から探す手がかり。空なら最新回）
            </label>
            <input
              id="guest-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              spellCheck={false}
            />
          </>
        )}

        <div className="guest-actions">
          <button type="button" className="studio-new" onClick={onResolve} disabled={busy}>
            {busy ? '解決中…' : '読み取る'}
          </button>
          {!fallback && (
            <button type="button" className="guest-link" onClick={() => setFallback(true)}>
              RSSを直接貼る
            </button>
          )}
        </div>

        {error && <p className="guest-error">{error}</p>}

        {preview && (
          <div className="guest-preview">
            {preview.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.image} alt="" width={72} height={72} />
            )}
            <div className="guest-preview-body">
              <div className="guest-preview-show">{preview.showName}</div>
              <div className="guest-preview-title">{preview.title}</div>
              <div className="guest-preview-meta">
                {preview.date}
                {preview.duration ? ` · ${preview.duration}` : ''}
                {preview.hasAudio ? ' · 音源あり' : ' · 音源なし'}
              </div>
              {!preview.rssFound && (
                <div className="guest-warn">
                  RSSが見つからない番組（Spotify独占配信）。日付・尺・カバーは取れて
                  いるので棚には正しく並ぶが、**サイト内では鳴らせない**。ページは
                  「Spotifyで聴く」ボタンだけになる
                </div>
              )}
              {preview.hasAudio && !preview.audioAllowed && (
                <div className="guest-warn">
                  ⚠ {preview.audioHost} はCSPのmedia-srcに無い。このままだとサイト内で
                  鳴らない（next.config.ts に許可を足すか、送客ボタンだけにする）
                </div>
              )}
            </div>
            <button type="button" className="studio-new" onClick={onSave} disabled={busy}>
              保存
            </button>
          </div>
        )}
      </div>

      <div className="guest-list">
        <h2 className="guest-list-head">登録済み {rows.length}</h2>
        {rows.length === 0 && <p className="guest-empty">まだありません</p>}
        {rows.map((r) => (
          <div key={r.id} className="guest-row">
            <div className="guest-row-body">
              <span className="guest-row-show">{r.showName}</span>
              <span className="guest-row-title">{r.title}</span>
              <span className="guest-row-meta">
                {r.date}
                {r.duration ? ` · ${r.duration}` : ''}
                {r.hasAudio ? '' : ' · 音源が取れていない'}
              </span>
            </div>
            <button type="button" className="guest-link" onClick={() => onDelete(r.id)} disabled={busy}>
              削除
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
