'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { dateShort } from '@/lib/site/text'
import { imgThumb, IMG_W } from '@/lib/site/img'
import type { EpisodeHit } from '@/lib/site/episodeSearch'

// MENUの中の検索(2026-08-23 Andy指定)。
//
// なぜトップの表面ではなくMENUの中か: 検索バーは「言葉を出せ」と要求する道具で、
// 言葉を持たずに来た人には空欄を突きつける。常設すると静けさも削る。
// MENUは元から「探しにいく」ための身振りなので、開いた人にだけ差し出す。
//
// ヒント: 空欄の代わりに「ここでは何が引けるか」を数種だけ静かに見せる。
// 番組中から語を機械抽出する案は取りやめ(負荷と精度、そして308語は多すぎる)。
const HINTS = [
  '北海道の地名',
  '釣りに関すること',
  'サカナの名前',
  '番組で話した本や映画',
  'ゲストの名前',
  '町や施設の名前',
] as const
const HINT_INTERVAL = 4400 // ワードマーク3000・MAILピル3600と割り切れない値にして拍を重ねない

export default function MenuSearch({ onNavigate }: { onNavigate?: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState('')
  // hitsは「どの語の結果か」と対で持つ。状態を効果の中で同期的に書き換えず、
  // 描画時に導出する(Reactの規約: 効果の本体で即setStateしない)
  const [result, setResult] = useState<{ q: string; hits: EpisodeHit[] }>({ q: '', hits: [] })
  const [hint, setHint] = useState(0)
  const [hintPaused, setHintPaused] = useState(false)

  // ヒントの巡回。読もう/触ろうとした瞬間に消えるのは苛立つので、
  // その領域に入ったら止める(hintPaused)
  useEffect(() => {
    if (hintPaused) return
    const id = setInterval(() => setHint((v) => (v + 1) % HINTS.length), HINT_INTERVAL)
    return () => clearInterval(id)
  }, [hintPaused])

  // スマホのソフトキーボードが覆う高さを測って--kbに入れる(2026-08-23 Andy指摘
  // 「キーボードがかぶってとても見えづらい」)。キーボードが出ても画面(100vh)は
  // 縮まないので、CSSだけでは結果がキーボードの裏まで伸びて見えないまま残る。
  // visualViewport=実際に見えている領域。その差ぶんを引けば、結果は見える帯の
  // 中に収まり、続きはその中で送れる
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const apply = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      box.current?.style.setProperty('--kb', `${Math.round(covered)}px`)
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
    }
  }, [])

  // 打鍵のたびには叩かない(デバウンス)。打ち終わりから300ms
  const seq = useRef(0)
  const needle = q.trim()
  useEffect(() => {
    if (needle.length === 0) return
    const mine = ++seq.current
    const timer = setTimeout(() => {
      fetch(`/api/podcast/search?q=${encodeURIComponent(needle)}`)
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((d: { hits?: EpisodeHit[] }) => {
          if (mine !== seq.current) return // 追い越された古い応答は捨てる
          setResult({ q: needle, hits: d.hits ?? [] })
        })
        .catch(() => {
          if (mine === seq.current) setResult({ q: needle, hits: [] })
        })
    }, 300)
    return () => clearTimeout(timer)
  }, [needle])

  // 表示の状態は導出する: 空欄=idle / 結果がまだこの語のものでない=searching
  const state = needle === '' ? 'idle' : result.q === needle ? 'done' : 'searching'
  const hits = result.q === needle ? result.hits : []

  return (
    <div className="menu-search" ref={box}>
      <div className="article-search menu-search-field">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="エピソードを探す"
          aria-label="エピソードを探す"
          enterKeyHint="search"
        />
      </div>

      {/* ヒント: 「何が引けるか」を静かに示す。結果が出ている間は引っ込める */}
      {state === 'idle' && (
        <p
          className="menu-search-hint"
          onMouseEnter={() => setHintPaused(true)}
          onMouseLeave={() => setHintPaused(false)}
          onTouchStart={() => setHintPaused(true)}
        >
          {HINTS.map((h, i) => (
            <span key={h} className={i === hint ? 'on' : undefined} aria-hidden={i !== hint}>
              {h}
            </span>
          ))}
        </p>
      )}

      {state === 'done' && hits.length === 0 && (
        <p className="menu-search-empty">該当なし</p>
      )}

      {hits.length > 0 && (
        <div className="menu-search-results grid4">
          {hits.map((ep) => (
            <div key={`${ep.showSlug}-${ep.id}`}>
              <Link
                href={ep.href}
                className="sq"
                aria-label={`${ep.showName} ${ep.title} ${dateShort(ep.date)}`}
                onClick={onNavigate}
              >
                {ep.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imgThumb(ep.thumb, IMG_W.tile)} alt="" loading="lazy" decoding="async" />
                ) : (
                  <span className="empty-cell" />
                )}
              </Link>
              <div className="ep-cell-label">
                <span className="ep-show">{ep.showName}</span>
                <span className="ep-title">{ep.title}</span>
                <span className="ep-date">{dateShort(ep.date)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
