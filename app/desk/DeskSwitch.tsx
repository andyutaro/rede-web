'use client'

// 放送卓(desk)と非公開メモ(private)を1タップで行き来する(2026-08-16 Andy指定)。
// メニューを開いて選ぶ往復が重かったので、**行き先を書いた1つのボタン**にする。
//
// 位置は両画面で同じ左上。押す前に必ずflushして、デバウンス待ちの数秒ぶんを
// 送り切る(クライアント遷移だとbeforeunloadが走らない、という既知の落とし穴)。
const MUTED = '#6b6b6b'
const FONT = '-apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif'

export default function DeskSwitch({
  current,
  onLeave,
}: {
  current: 'desk' | 'private'
  onLeave?: () => void
}) {
  const toPrivate = current === 'desk'
  return (
    <button
      type="button"
      onClick={() => {
        onLeave?.()
        location.href = toPrivate ? '/desk/private' : '/desk'
      }}
      style={{
        background: 'none',
        border: '1px solid rgba(232,230,224,0.20)',
        borderRadius: 999,
        color: MUTED,
        fontSize: 11,
        letterSpacing: '0.14em',
        padding: '5px 13px',
        cursor: 'pointer',
        fontFamily: FONT,
        whiteSpace: 'nowrap',
      }}
    >
      {toPrivate ? 'PRIVATE →' : '← DESK'}
    </button>
  )
}
