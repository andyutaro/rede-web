'use client'

import { useEffect, useRef } from 'react'
import { paintShapeCentered } from './waveCreatures'

// その日に来た生きものを、背景いっぱいに静かに漂わせる(2026-08-16 Andy指定)。
// 「この日に来てくれた人」の並びが記録だとすれば、こちらはその日の気配。
//
// 読む邪魔をしないための約束:
// ・波形と同じ背面(z-index -1)・pointer-events none。本文には一切触れない
// ・波形(0.45)や並び(0.55)より薄い。線幅と色は波形と同じ=線の文法を崩さない
// ・動きは毎秒数ピクセル。目で追える速さにしない
// ・「動きを減らす」設定なら止まったまま1枚だけ描く
// ・数は最大14。その日に何人来ても画面は静かなまま(数を語らせない)
const MAX_ON_SCREEN = 14
const ALPHA = 0.3

// 日付から決まる乱数=同じ日を開けば同じ配置になる(充当サムネイルと同じ考え方)
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Drifter = {
  kind: number
  x: number
  y: number
  vx: number
  vy: number
  size: number
  phase: number
  bob: number
}

export default function CreatureDrift({ kinds, seed }: { kinds: number[]; seed: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || kinds.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const rnd = seeded([...seed].reduce((a, c) => a * 31 + c.charCodeAt(0), 7))
    // その日の絵柄から最大14匹。多い日も画面は静かなまま
    const picked = kinds.length <= MAX_ON_SCREEN
      ? kinds
      : Array.from({ length: MAX_ON_SCREEN }, () => kinds[Math.floor(rnd() * kinds.length)])

    let w = 0
    let h = 0
    let color = ''
    const drifters: Drifter[] = []

    function readColor() {
      color = getComputedStyle(document.documentElement).getPropertyValue('--wave').trim() || '#c7c7c1'
    }

    function layout() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = window.innerWidth
      h = window.innerHeight
      canvas!.width = Math.round(w * dpr)
      canvas!.height = Math.round(h * dpr)
      canvas!.style.width = `${w}px`
      canvas!.style.height = `${h}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      readColor()
      if (drifters.length === 0) {
        for (const kind of picked) {
          const dir = rnd() < 0.5 ? -1 : 1
          drifters.push({
            kind,
            x: rnd() * w,
            y: rnd() * h,
            // 毎秒3〜9px。目で追える速さにしない
            vx: dir * (3 + rnd() * 6),
            vy: (rnd() - 0.5) * 2,
            size: 13 + rnd() * 8,
            phase: rnd() * Math.PI * 2,
            bob: 4 + rnd() * 6,
          })
        }
      }
    }

    let raf = 0
    let last = 0
    const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)')

    function draw(t: number) {
      ctx!.clearRect(0, 0, w, h)
      ctx!.strokeStyle = color
      ctx!.globalAlpha = ALPHA
      ctx!.lineWidth = 1.25
      ctx!.lineJoin = 'round'
      ctx!.lineCap = 'round'
      for (const d of drifters) {
        // 上下のゆらぎは位置ではなく描画時に足す(戻り道が単調にならない)
        const y = d.y + Math.sin(t * 0.0004 + d.phase) * d.bob
        paintShapeCentered(ctx!, d.kind, d.x, y, d.size)
      }
      ctx!.globalAlpha = 1
    }

    function step(t: number) {
      if (t - last >= 33) {
        const dt = Math.min(64, t - last) / 1000
        last = t
        for (const d of drifters) {
          d.x += d.vx * dt
          d.y += d.vy * dt
          // 画面外へ出たら反対側から戻る(端で消えない=数が減ったように見えない)
          const m = d.size * 2
          if (d.x < -m) d.x = w + m
          if (d.x > w + m) d.x = -m
          if (d.y < -m) d.y = h + m
          if (d.y > h + m) d.y = -m
        }
        draw(t)
      }
      raf = requestAnimationFrame(step)
    }

    function applyMotionPref() {
      cancelAnimationFrame(raf)
      if (reduceMq.matches) draw(0)
      else raf = requestAnimationFrame(step)
    }

    layout()
    const onResize = () => {
      layout()
      draw(last)
    }
    window.addEventListener('resize', onResize)
    reduceMq.addEventListener('change', applyMotionPref)
    // テーマ切替に追従(波形と同じ作法)
    const obs = new MutationObserver(() => {
      readColor()
      draw(last)
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    applyMotionPref()

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      reduceMq.removeEventListener('change', applyMotionPref)
      obs.disconnect()
    }
  }, [kinds, seed])

  if (kinds.length === 0) return null
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  )
}
