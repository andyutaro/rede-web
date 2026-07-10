'use client'

import { useState, useCallback } from 'react'

// 全ページ対象の画像ライトボックス。
// <a>の子でないimgをタップ→フルサイズ表示。リンク付き画像はスキップ。
export default function ImageLightbox({ children }: { children: React.ReactNode }) {
  const [src, setSrc] = useState<string | null>(null)
  const [alt, setAlt] = useState('')
  const [scale, setScale] = useState(1)

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const img = (e.target as HTMLElement).closest('img')
    if (!img) return
    if (img.closest('a')) return // リンク付き画像は通常遷移に委ねる
    setSrc(img.getAttribute('src') ?? null)
    setAlt(img.getAttribute('alt') ?? '')
    setScale(1)
  }, [])

  const close = useCallback(() => setSrc(null), [])

  return (
    <div onClick={handleClick}>
      {children}
      {src && (
        <div className="lb-overlay" onClick={close}>
          <div className="lb-content" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={alt}
              className="lb-img"
              style={{ transform: `scale(${scale})` }}
            />
          </div>
          <div className="lb-controls" onClick={(e) => e.stopPropagation()}>
            <button
              className="lb-btn"
              type="button"
              onClick={() => setScale((s) => Math.min(+(s + 0.25).toFixed(2), 4))}
              aria-label="拡大"
            >
              ＋
            </button>
            <button
              className="lb-btn"
              type="button"
              onClick={() => setScale((s) => Math.max(+(s - 0.25).toFixed(2), 0.25))}
              aria-label="縮小"
            >
              −
            </button>
            <button className="lb-btn lb-close" type="button" onClick={close} aria-label="閉じる">
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
