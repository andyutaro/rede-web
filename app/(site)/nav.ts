// ナビは実在ページのみ載せる(2026-07-04司令塔決定)。
// 最終形は Home / Updates / Podcast / Article / Tags / About の6項目(handoff-notes §1)。
// Podcast / Tags / About はページ実装時にここへ追加する。
export const NAV = [
  { label: 'Home', href: '/' },
  { label: 'Updates', href: '/updates' },
  { label: 'Article', href: '/article' },
] as const
