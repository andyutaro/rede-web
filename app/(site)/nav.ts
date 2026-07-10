// ナビは実在ページのみ載せる(2026-07-04司令塔決定)。
// 最終形は Home / Updates / Podcast / Notes / Tags / About の6項目
// (Article棚は2026-07-10にNotesへ改名: scribe/article/photographyを含む棚名)。
// Podcast / Tags / About はページ実装時にここへ追加する。
export const NAV = [
  { label: 'Home', href: '/' },
  { label: 'Updates', href: '/updates' },
  { label: 'Podcast', href: '/podcast' },
  { label: 'Notes', href: '/notes' },
  { label: 'About', href: '/about' },
] as const
