'use client'

import { useEffect, useRef } from 'react'
import { paintShapeCentered } from './waveCreatures'

// 「今日来てくれた人」(2026-08-07 Andy指定)。その日に波形へ生えた線画を、
// 生えた順にずらっと並べる。遊びの意匠であって機能ではないので、
// 数字も名前も出さないし、何かを押せるようにもしない。
// 絵は波形と同じ色・同じ線幅で描く(サイト全体で線の文法をひとつに保つ)。
const CELL = 26
const SIZE = 9

export default function CreatureRow({ kinds }: { kinds: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || kinds.length === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = canvas.parentElement?.clientWidth ?? canvas.clientWidth
      const cols = Math.max(1, Math.floor(w / CELL))
      const rows = Math.ceil(kinds.length / cols)
      const h = rows * CELL
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const color = getComputedStyle(document.documentElement).getPropertyValue('--wave').trim()
      ctx.strokeStyle = color || '#c7c7c1'
      ctx.globalAlpha = 0.55
      ctx.lineWidth = 1.25
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      kinds.forEach((k, i) => {
        const cx = (i % cols) * CELL + CELL / 2
        const cy = Math.floor(i / cols) * CELL + CELL / 2
        paintShapeCentered(ctx, k, cx, cy, SIZE)
      })
    }

    draw()
    window.addEventListener('resize', draw)
    // テーマ切替に追従(波形と同じ作法)
    const obs = new MutationObserver(draw)
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      window.removeEventListener('resize', draw)
      obs.disconnect()
    }
  }, [kinds])

  if (kinds.length === 0) return null
  return <canvas ref={ref} className="creature-row" aria-hidden="true" />
}
