'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { dateShort } from '@/lib/site/text'
import { imgThumb, IMG_W } from '@/lib/site/img'
import { KINDS, paintShapeCentered } from './waveCreatures'
import type { EpisodeHit } from '@/lib/site/episodeSearch'

// MENUの中の検索(2026-08-23 Andy指定)。
//
// なぜトップの表面ではなくMENUの中か: 検索バーは「言葉を出せ」と要求する道具で、
// 言葉を持たずに来た人には空欄を突きつける。常設すると静けさも削る。
// MENUは元から「探しにいく」ための身振りなので、開いた人にだけ差し出す。
//
// ヒント: 空欄の代わりに「ここでは何が引けるか」を数種だけ静かに見せる。
// 番組中から語を機械抽出する案は取りやめ(負荷と精度、そして308語は多すぎる)。
// 語はAndy自身のもの(2026-08-23差し替え)。ここは番組の手触りを渡す場所なので、
// 分類名を並べない=「サカナの名前」ではなく「サカナな言葉」
const HINTS = [
  '北海道の地名',
  'サカナな言葉',
  'おいしいもの',
  '自然のことば',
  'ゲストの名前',
  'ポッドキャスト',
] as const
// 出方は一文字ずつ(2026-08-23 Andy指定「切り替わりがゆっくりすぎる/一文字ずつ
// 出てくる感じで」)。打って→少し置いて→消して→次、で一連の手つきに見せる。
// 一語およそ2.4秒=以前の4.4秒から半分。消しは打ちより速い(戻る動作は溜めない)
const TYPE_MS = 68
const HOLD_MS = 1500
const ERASE_MS = 32
const GAP_MS = 280

// 語の終わりに生きものを1体。波形から生えるあの線画と同じ絵を、同じ色・同じ
// 線幅で置く(2026-08-23 Andy指定)。語が変わるたびに引き直す=毎回ちがう一体が
// 顔を出す。サイト全体で線の文法をひとつに保つための共有
const CREATURE_BOX = 20

function HintCreature({ kind }: { kind: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(CREATURE_BOX * dpr)
      canvas.height = Math.round(CREATURE_BOX * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, CREATURE_BOX, CREATURE_BOX)
      ctx.strokeStyle =
        getComputedStyle(document.documentElement).getPropertyValue('--wave').trim() || '#c7c7c1'
      // 一覧(CreatureRow)は0.55だが、こちらは12pxの文字の隣なので半段濃く。
      // 大きさの比(絵/箱)は一覧の11/32に合わせる=どこで見ても同じ生きもの
      ctx.globalAlpha = 0.75
      ctx.lineWidth = 1.1
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      paintShapeCentered(ctx, kind, CREATURE_BOX / 2, CREATURE_BOX / 2, CREATURE_BOX * (11 / 32))
    }
    draw()
    // テーマ切替に追従(波形・一覧と同じ作法)
    const obs = new MutationObserver(draw)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [kind])

  return (
    <canvas
      ref={ref}
      className="menu-search-creature"
      style={{ width: CREATURE_BOX, height: CREATURE_BOX }}
      aria-hidden="true"
    />
  )
}

export default function MenuSearch({ onNavigate }: { onNavigate?: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [q, setQ] = useState('')
  // hitsは「どの語の結果か」と対で持つ。状態を効果の中で同期的に書き換えず、
  // 描画時に導出する(Reactの規約: 効果の本体で即setStateしない)
  const [result, setResult] = useState<{ q: string; hits: EpisodeHit[] }>({ q: '', hits: [] })
  const [hint, setHint] = useState(0)
  const [typed, setTyped] = useState(0) // 何文字目まで出したか
  const [erasing, setErasing] = useState(false)
  const [creature, setCreature] = useState(0)
  const [hintPaused, setHintPaused] = useState(false)

  // ヒントの巡回。打つ→置く→消す→次、を一つの効果で回す。
  // 読もう/触ろうとした瞬間に消えるのは苛立つので、その領域に入ったら止める。
  // ただし打ちかけで固まると中途半端な文字列が残るので、最後まで出してから止める
  useEffect(() => {
    const word = HINTS[hint]
    if (hintPaused) {
      if (erasing || typed >= word.length) return
      const id = setTimeout(() => setTyped(word.length), TYPE_MS)
      return () => clearTimeout(id)
    }
    if (!erasing && typed < word.length) {
      const id = setTimeout(() => setTyped(typed + 1), TYPE_MS)
      return () => clearTimeout(id)
    }
    if (!erasing) {
      const id = setTimeout(() => setErasing(true), HOLD_MS)
      return () => clearTimeout(id)
    }
    if (typed > 0) {
      const id = setTimeout(() => setTyped(typed - 1), ERASE_MS)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => {
      setErasing(false)
      setHint((v) => (v + 1) % HINTS.length)
      setCreature(Math.floor(Math.random() * KINDS))
    }, GAP_MS)
    return () => clearTimeout(id)
  }, [hint, typed, erasing, hintPaused])

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
          {/* 一字ずつ変わる部分は読み上げから外す(一文字ごとに読み直されてしまう)。
              代わりに全部の語を静かな一行として置いておく */}
          <span className="sr-only">例: {HINTS.join('、')}</span>
          <span aria-hidden="true">{HINTS[hint].slice(0, typed)}</span>
          {/* 生きものは語が出揃っている間だけ。打ちかけの隣に置くと、
              文字が伸びるたび押し出されて落ち着かない */}
          {!erasing && typed === HINTS[hint].length && <HintCreature kind={creature} />}
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
