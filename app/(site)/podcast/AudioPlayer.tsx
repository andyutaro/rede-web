'use client'

import { useEffect, useRef, useState } from 'react'

// エピソード音源(RSSのenclosure MP3)を鳴らすネイティブのシークバー付きプレイヤー。
// サイト内で「今聴いているこの1話」を再生するための最小プレイヤー。
// 外部プラットフォームへの送客ボタンとは別物(あちらは番組単位のリンク)。
export default function AudioPlayer({ src, title }: { src: string; title: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTime = () => setCurrent(a.currentTime)
    const onMeta = () => {
      setDuration(a.duration || 0)
      setReady(true)
    }
    const onEnd = () => setPlaying(false)
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('ended', onEnd)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('ended', onEnd)
    }
  }, [])

  function toggle() {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      a.play()
      setPlaying(true)
    } else {
      a.pause()
      setPlaying(false)
    }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const a = audioRef.current
    if (!a) return
    const t = Number(e.target.value)
    a.currentTime = t
    setCurrent(t)
  }

  return (
    <div className="audio-player">
      {/* preload metadataで長さだけ先読み(自動再生はしない) */}
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        className="audio-toggle"
        onClick={toggle}
        aria-label={playing ? `${title}を一時停止` : `${title}を再生`}
        disabled={!ready}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <input
        className="audio-seek"
        type="range"
        min={0}
        max={duration || 0}
        step={1}
        value={current}
        onChange={seek}
        disabled={!ready}
        aria-label="再生位置"
      />
      <span className="audio-time">
        {fmt(current)} / {ready ? fmt(duration) : '--:--'}
      </span>
    </div>
  )
}

function fmt(sec: number): string {
  if (!Number.isFinite(sec)) return '--:--'
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
