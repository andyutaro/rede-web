'use client'

import { useEffect, useRef, useState } from 'react'
import { paintShapeCentered } from './waveCreatures'

// 「今日来てくれた人」(2026-08-07 Andy指定)。その日に波形へ生えた線画を、
// 生えた順にずらっと並べる。遊びの意匠であって機能ではないので、
// 数字も名前も出さない。
// 絵は波形と同じ色・同じ線幅で描く(サイト全体で線の文法をひとつに保つ)。
// タップで1体だけ拡大表示(2026-08-12 Andy指定)。紙色の面に大きく描いて、
// どこを押しても閉じる。名前や説明は拡大しても付けない(触ればわかる、のまま)
const CELL = 32
const SIZE = 11

function waveColor(): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--wave').trim() || '#c7c7c1'
  )
}

// 拡大表示。1体を画面中央に、行と同じ線幅のまま大きく描く
function CreaturePop({ kind, onClose }: { kind: number; onClose: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const draw = () => {
      const box = Math.min(window.innerWidth * 0.7, 380)
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.style.width = `${box}px`
      canvas.style.height = `${box}px`
      canvas.width = Math.round(box * dpr)
      canvas.height = Math.round(box * dpr)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.strokeStyle = waveColor()
      // 線幅は行と同じ1.25のまま(巨大な細線画=引き算の文法)。淡すぎると
      // 大画面で消えるので、濃さだけ行(0.55)より半段上げる
      ctx.globalAlpha = 0.75
      ctx.lineWidth = 1.25
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      // 形は最大で±1.2単位ほど広がるので、箱に収まる倍率にする
      paintShapeCentered(ctx, kind, box / 2, box / 2, box / 3)
    }
    draw()
    window.addEventListener('resize', draw)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', draw)
      window.removeEventListener('keydown', onKey)
    }
  }, [kind, onClose])

  return (
    <div className="creature-pop" onClick={onClose} role="dialog" aria-label="来てくれた人">
      <canvas ref={ref} />
    </div>
  )
}

export default function CreatureRow({ kinds }: { kinds: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [popKind, setPopKind] = useState<number | null>(null)

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
      ctx.strokeStyle = waveColor()
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

  // タップした位置からセルを逆算して、その1体を拡大する
  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = ref.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const cols = Math.max(1, Math.floor(rect.width / CELL))
    const col = Math.floor((e.clientX - rect.left) / CELL)
    const row = Math.floor((e.clientY - rect.top) / CELL)
    if (col >= cols) return // 右端の余白
    const i = row * cols + col
    if (i >= 0 && i < kinds.length) setPopKind(kinds[i])
  }

  if (kinds.length === 0) return null
  return (
    <>
      <canvas ref={ref} className="creature-row" aria-hidden="true" onClick={onClick} />
      {popKind != null && <CreaturePop kind={popKind} onClose={() => setPopKind(null)} />}
    </>
  )
}
