'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

// 背景波形 + ラジオ(2026-07-19、単発ランダム→連続再生化)。
// - 波形は固定背景、コンテンツの背後。RADIOピルを押すと局に「合流」する:
//   1本目は10:00地点から(放送中の局に途中から入る体験。READMEの選定方針)、
//   終わると次のエピソードが頭から始まり、キューを順に流し続ける(番組編成)。
//   「途中から再生」は初回のチューンインの演出であり、以降は通常の放送が続く。
// - 曲間はフェードインで繋ぐ。タイトル表示は再生中のみ(タップで当該エピソードへ)。
// 波形は合成(README推奨・堅牢)。実音とは独立に流し、playingで振幅/速度だけ上げる。
// 再生開始は必ずクリックハンドラ内(自動再生ポリシー。ended→次はブラウザが許容)。

// dateは表示用に整形済みのリリース日(2026.07.08形式)。episodesはlayoutが組んだ
// 再生キュー(番組均等ラウンドロビン10本、ページロード毎に変わる)
type Episode = { audioUrl: string; showName: string; title: string; date: string; href: string }

const START_AT = 600 // 10:00から再生(尺が足りなければ25%地点にフォールバック)

// ハンドオフ確定値(2a「かろうじて分かる/最小」)
const CFG = {
  seed: 20260713,
  n: 720,
  amp: 0.035,
  ampP: 0.085,
  op: 0.45,
  opP: 0.75,
  lw: 1.25, // 地の暖白化で沈んだ分、色調(--wave)と合わせて半段だけ太く(2026-07-14)
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

// 再生開始のフェードイン(2026-07-19 Andy要望): 無音からFADE_MSかけて音量を上げる。
// カーブは2乗(音量=振幅は対数知覚なので、直線より立ち上がりが自然)。
// rAF主導+timeupdateフォールバック(タブが裏に回るとrAFが止まり小音量のまま
// 流れ続けるため。timeupdateは再生中なら裏でも発火する)。
// 注: iOS Safariはメディア音量がOS管理(volume書き込み無視)のためフェードは
// 効かず即時full音量になる(実害なし・従来挙動)
const FADE_MS = 1200
const fadeRafBox = { current: 0 } // 波形ヒーローは1ページ1個なのでモジュール共有でよい

function fadeInAudio(a: HTMLAudioElement, rafBox: { current: number }) {
  cancelAnimationFrame(rafBox.current)
  const t0 = performance.now()
  a.volume = 0
  const apply = () => {
    const p = Math.min(1, (performance.now() - t0) / FADE_MS)
    a.volume = a.paused ? 1 : p * p
    if (p >= 1 || a.paused) a.removeEventListener('timeupdate', apply)
    return p
  }
  a.addEventListener('timeupdate', apply)
  const step = () => {
    if (apply() < 1 && !a.paused) rafBox.current = requestAnimationFrame(step)
  }
  rafBox.current = requestAnimationFrame(step)
}

export default function WaveformHero({ episodes }: { episodes: Episode[] | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  // 再生キューの現在位置。表示(タイトル等)はidx、音源制御はidxRef(リスナー内から参照)
  const [idx, setIdx] = useState(0)
  const idxRef = useRef(0)
  const episode = episodes?.[idx % episodes.length] ?? null
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

  // 音源はマウント時に仕込む。preload='metadata'で1本目の10:00シークまで先に
  // 済ませ、初回クリック時の無音を短縮する(2026-07-19)。play()はクリック内(ポリシー)。
  // 連続再生: 'ended'でキューの次へ(頭から)。src差し替えは同一Audio要素で行う
  // (ユーザー操作起点の連続再生としてブラウザが許容する)。読めない音源(URL失効等)は
  // 1本飛ばす(全滅したら停止)
  useEffect(() => {
    if (!episodes || episodes.length === 0) return
    const a = new Audio()
    a.preload = 'metadata'
    a.src = episodes[0].audioUrl
    a.addEventListener(
      'loadedmetadata',
      () => {
        // 1本目だけ10:00へシーク=放送への「途中から合流」(尺が足りなければ25%地点)
        const d = a.duration
        a.currentTime = d && d > START_AT + 40 ? START_AT : d ? d * 0.25 : 0
      },
      { once: true }
    )

    let errorStreak = 0
    const advance = () => {
      idxRef.current += 1
      setIdx(idxRef.current)
      const next = episodes[idxRef.current % episodes.length]
      a.src = next.audioUrl // 2本目以降は頭から(次の番組が始まる)
      fadeInAudio(a, fadeRafBox)
      a.play().catch(() => setPlaying(false))
    }

    a.addEventListener('ended', () => {
      if (errorStreak < episodes.length) advance()
    })
    a.addEventListener('error', () => {
      // 再生中の失効等のみ自動スキップ(未再生時のプリロード失敗では鳴らさない)
      if (!playingRef.current) return
      errorStreak += 1
      if (errorStreak < episodes.length) advance()
      else setPlaying(false)
    })
    a.addEventListener('pause', () => {
      // 自然な終端(ended)ではオーバーレイを維持し、次の曲へ継ぎ目なく渡す
      if (!a.ended) setPlaying(false)
    })
    a.addEventListener('play', () => {
      errorStreak = 0
      setPlaying(true)
    })
    audioRef.current = a
    return () => {
      a.pause()
      audioRef.current = null
    }
  }, [episodes])

  // ページ遷移で再生と表示を止める(2026-07-14 Andy指摘)。layout常駐のため
  // 遷移してもアンマウントされず、表示が開いたままだと「遷移したかどうか
  // 極めて気付けない」。pause→'pause'イベント→setPlaying(false)で表示も閉じる
  const pathname = usePathname()
  useEffect(() => {
    audioRef.current?.pause()
  }, [pathname])

  // メニューを開いたときも再生と表示を止める(SiteMenuが発するイベントを受ける)
  useEffect(() => {
    const onMenuOpen = () => audioRef.current?.pause()
    window.addEventListener('andy:menu-open', onMenuOpen)
    return () => window.removeEventListener('andy:menu-open', onMenuOpen)
  }, [])

  // 再生中は背面スクロールを止める(メニュー展開時と同じ挙動)
  useEffect(() => {
    document.body.style.overflow = playing ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [playing])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) {
      a.pause()
      return
    }
    // 自動再生ポリシー: play()はこのクリック内で呼ぶ
    fadeInAudio(a, fadeRafBox)
    a.play().catch(() => setPlaying(false))
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
            ON AIR — 連続再生
          </div>
          <Link href={episode.href} className="sound-ep">
            {/* リリース日は番組名と同じ行(エピソードページのヘッド「番組名 — 日付」と同じ語彙) */}
            <span className="show">{episode.showName} — {episode.date}</span>
            <span className="ttl">{episode.title}</span>
            <span className="go">エピソードを開く →</span>
          </Link>
        </div>
      )}

      {/* RADIOボタン: 右レール同幅ピル・Y中央固定。初見に「これはラジオ(連続再生)」と
          伝わるようラベル付き(再生中はON AIR)(2026-07-19 Andy要望) */}
      {episode && (
        <button
          ref={btnRef}
          type="button"
          className={`sound-btn${playing ? ' on' : ''}`}
          onClick={toggle}
          aria-label={playing ? 'ラジオを止める' : 'ラジオを流す(エピソードを連続再生)'}
        >
          <span className="sound-btn-label">{playing ? 'ON AIR' : 'RADIO'}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
