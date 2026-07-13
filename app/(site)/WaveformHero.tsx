'use client'

import { useEffect, useRef, useState } from 'react'

// トップページの背景波形 + サウンドオンボタン(2026-07-13、Claude Designハンドオフの実装)。
// 既存サイトのデザイン(ライト/ダーク両テーマ・既存Home要素)を優先し、そこへ馴染ませる:
// - 波形色はハードコード(#8b8f86/near-black前提)ではなくCSS変数--waveでテーマ追従
// - 右上のトグル/Contact/MENU・ワードマークは既にlayoutにあるので重複させない
// - 波形は「背景」= viewport縦中央に固定、pointer-events none、コンテンツの背後
// 音は既定ミュート。波形は常時ゆっくり流れ、ボタンで実音を足す二段構え
// (READMEの推奨=合成波形。実音とは独立に流し、playingで振幅/速度だけ上げる)。
// 実音の再生開始は必ずクリックハンドラ内(ブラウザの自動再生ポリシー)。

type Episode = { audioUrl: string; showName: string; title: string }

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
  bx: 0.84, // ボタン中心のx(幅に対する比)
  r: 44, // ボタン半径(波形をボタン手前で止める)
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
  // 描画ループ(初回effectのみ)から現在のplayingを読むためrefへ同期
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

    // 波形色はCSS変数から。テーマ切替に追従(data-theme変化を監視)
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

      // ボタンが縦中央付近にある(=波形の線上)ときだけ、波形をボタン手前で止めて接続する。
      // モバイルでボタンが下部に退避した場合は全幅で描く(接続しない)。
      const btn = btnRef.current
      let endX = w - 8
      let connectX: number | null = null
      if (btn) {
        const br = btn.getBoundingClientRect()
        const bcx = br.left + br.width / 2
        const bcy = br.top + br.height / 2
        if (Math.abs(bcy - cy) < h * 0.22 && bcx > w * 0.4) {
          endX = bcx - CFG.r - 8
          connectX = bcx - CFG.r
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

  // ---- 実音(クリックで開始/停止。ページ離脱で停止) ----
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  const toggle = () => {
    if (!episode) return
    // 自動再生ポリシー: このクリック(ユーザージェスチャ)内で再生を始める
    if (!audioRef.current) {
      const a = new Audio(episode.audioUrl)
      a.preload = 'none'
      a.addEventListener('ended', () => setPlaying(false))
      a.addEventListener('pause', () => setPlaying(false))
      a.addEventListener('play', () => setPlaying(true))
      audioRef.current = a
    }
    const a = audioRef.current
    if (playing) {
      a.pause()
    } else {
      a.play().catch(() => setPlaying(false))
    }
  }

  return (
    <>
      <canvas ref={canvasRef} className="wave-bg" aria-hidden="true" />

      {episode && (
        <div className={`sound-cluster${playing ? ' is-playing' : ''}`}>
          <div className="sound-live" aria-hidden={!playing}>
            <span className="dot" />
            <span className="label">LIVE</span>
          </div>

          <button
            ref={btnRef}
            type="button"
            className="sound-btn"
            onClick={toggle}
            aria-label={playing ? '音を止める' : '音を出す'}
          >
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 9 H7 L12 4 V20 L7 15 H3 Z" fill="currentColor" />
              {playing && (
                <>
                  <path d="M15.6 8.8 a4.6 4.6 0 0 1 0 6.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M18.1 6.3 a8.6 8.6 0 0 1 0 11.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>

          <div className="sound-nowplaying">
            <div className="status">{playing ? '再生中' : '音を出す'}</div>
            <div className="ep">
              {episode.showName}
              <br />
              {episode.title}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
