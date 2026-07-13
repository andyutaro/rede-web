'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

// トップページの背景波形 + サウンドオン(2026-07-13。2026-07-13後半に整列/簡素化)。
// - 波形は固定背景(z:0)、コンテンツの背後。音は既定ミュート、常時ゆっくり流れる。
// - サウンドボタンは右レール(テーマ/Contact/MENU)と同幅のピル。X=レール、Y=画面中央固定。
// - 音を出すとメニュー同様に背景をぼかし、そこで初めてエピソードタイトルを表示。
//   タイトルのタップで当該エピソードページへ遷移(遷移=アンマウントで再生停止)。
// - 再生は途中(10:00)から(READMEの選定方針: シークバー無しで途中から)。
// 波形は合成(README推奨・堅牢)。実音とは独立に流し、playingで振幅/速度だけ上げる。
// 再生開始は必ずクリックハンドラ内(自動再生ポリシー)。

type Episode = { audioUrl: string; showName: string; title: string; href: string }

const START_AT = 600 // 10:00から再生(尺が足りなければ25%地点にフォールバック)

// ハンドオフ確定値(2a「かろうじて分かる/最小」)
const CFG = {
  seed: 20260713,
  n: 720,
  amp: 0.035,
  ampP: 0.085,
  op: 0.45,
  opP: 0.75,
  lw: 1,
  speed: 0.013,
  speedP: 0.05,
}

function makePeaks(n: number, seed: number): number[] {
  let s = seed >>> 0
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const arr: number[] = []
  for (let i = 0; i < n; i++) {
    const t = i / n
    let v = 0
    v += Math.sin(t * Math.PI * 2 * 3) * 0.3
    v += Math.sin(t * Math.PI * 2 * 7 + 1.3) * 0.18
    v += Math.sin(t * Math.PI * 2 * 13 + 0.7) * 0.1
    v += (rnd() - 0.5) * 0.55
    arr.push(v)
  }
  let max = 0
  for (const x of arr) max = Math.max(max, Math.abs(x))
  return arr.map((x) => 0.5 + 0.5 * (x / (max || 1)))
}

export default function WaveformHero({ episode }: { episode: Episode | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const playingRef = useRef(false)
  useEffect(() => {
    playingRef.current = playing
  }, [playing])

  // ---- 波形アニメーション(常時) ----
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const peaks = makePeaks(CFG.n, CFG.seed)
    let w = 0
    let h = 0
    let raf = 0
    let last = 0

    let color = '#c7c7c1'
    const readColor = () => {
      const c = getComputedStyle(document.documentElement).getPropertyValue('--wave').trim()
      if (c) color = c
    }
    readColor()
    const themeObs = new MutationObserver(readColor)
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25)
      const rect = canvas.getBoundingClientRect()
      w = rect.width
      h = rect.height
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      readColor()
    }
    window.addEventListener('resize', resize)
    resize()

    const draw = (t: number) => {
      const playing = playingRef.current
      const n = peaks.length
      const cy = h * 0.5

      // ボタン(右レールのピル)が縦中央付近にあるとき、波形をその左エッジ手前で止めて接続
      const btn = btnRef.current
      let endX = w - 8
      let connectX: number | null = null
      if (btn) {
        const br = btn.getBoundingClientRect()
        const bcy = br.top + br.height / 2
        if (Math.abs(bcy - cy) < h * 0.25 && br.left > w * 0.4) {
          endX = br.left - 10
          connectX = br.left - 2
        }
      }
      if (endX < 40) endX = w - 8

      ctx.clearRect(0, 0, w, h)
      const amp = (playing ? CFG.ampP : CFG.amp) * h * (0.92 + 0.08 * Math.sin(t * 0.0014))
      const off = t * (playing ? CFG.speedP : CFG.speed)
      ctx.beginPath()
      for (let x = 0; x <= endX; x += 3) {
        const f = x / endX
        const idx = (f * (n - 1) + off) % (n - 1)
        const i0 = Math.floor(idx)
        const frac = idx - i0
        const p = peaks[i0] * (1 - frac) + peaks[(i0 + 1) % n] * frac
        const bip = (p - 0.5) * 2
        const taper = Math.min(1, Math.min(x, endX - x) / 90)
        const y = cy + bip * amp * taper
        if (x === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      if (connectX !== null) ctx.lineTo(connectX, cy) // ボタンへ水平ベースラインで接続
      ctx.strokeStyle = color
      ctx.globalAlpha = playing ? CFG.opP : CFG.op
      ctx.lineWidth = CFG.lw
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.globalAlpha = 1
    }

    const loop = (t: number) => {
      if (t - last >= 33) {
        last = t
        draw(t)
      } // ~30fps
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      themeObs.disconnect()
    }
  }, [])

  // ページ離脱で音を止める
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  // 再生中は背面スクロールを止める(メニュー展開時と同じ挙動)
  useEffect(() => {
    document.body.style.overflow = playing ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [playing])

  const toggle = () => {
    if (!episode) return
    // 自動再生ポリシー: このクリック内で再生を始める
    if (!audioRef.current) {
      const a = new Audio(episode.audioUrl)
      a.preload = 'none'
      // メタデータが来たら10:00へシーク(尺が足りなければ25%地点)
      a.addEventListener(
        'loadedmetadata',
        () => {
          const d = a.duration
          a.currentTime = d && d > START_AT + 40 ? START_AT : d ? d * 0.25 : 0
        },
        { once: true }
      )
      a.addEventListener('ended', () => setPlaying(false))
      a.addEventListener('pause', () => setPlaying(false))
      a.addEventListener('play', () => setPlaying(true))
      audioRef.current = a
    }
    const a = audioRef.current
    if (playing) a.pause()
    else a.play().catch(() => setPlaying(false))
  }

  return (
    <>
      {/* 再生中はオーバーレイ(z:24)の上へ持ち上げて波形を見せる */}
      <canvas ref={canvasRef} className={`wave-bg${playing ? ' playing' : ''}`} aria-hidden="true" />

      {/* 再生中の背景ぼかし(クリックで停止)。タイトル/波形はこの上に出す */}
      {episode && (
        <div
          className={`sound-overlay${playing ? ' on' : ''}`}
          aria-hidden={!playing}
          onClick={() => audioRef.current?.pause()}
        />
      )}

      {/* エピソードタイトル(z:26 = 波形より前で読める。タップで当該エピソードへ) */}
      {episode && (
        <div className={`sound-title${playing ? ' on' : ''}`} aria-hidden={!playing}>
          <div className="sound-nowlabel">
            <span className="dot" />
            NOW PLAYING
          </div>
          <Link href={episode.href} className="sound-ep">
            <span className="show">{episode.showName}</span>
            <span className="ttl">{episode.title}</span>
            <span className="go">エピソードを開く →</span>
          </Link>
        </div>
      )}

      {/* サウンドボタン: 右レール同幅ピル・Y中央固定 */}
      {episode && (
        <button
          ref={btnRef}
          type="button"
          className={`sound-btn${playing ? ' on' : ''}`}
          onClick={toggle}
          aria-label={playing ? '音を止める' : '音を出す'}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M3 9 H7 L12 4 V20 L7 15 H3 Z" fill="currentColor" />
            {playing && (
              <>
                <path d="M15.6 8.8 a4.6 4.6 0 0 1 0 6.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M18.1 6.3 a8.6 8.6 0 0 1 0 11.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </>
            )}
          </svg>
        </button>
      )}
    </>
  )
}
