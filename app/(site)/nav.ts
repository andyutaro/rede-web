// ナビは実在ページのみ載せる(2026-07-04司令塔決定)。
// 最終形は Home / Updates / Podcast / Notes / Tags / About の6項目
// (Article棚は2026-07-10にNotesへ改名: scribe/article/photographyを含む棚名)。
// Podcast / Tags / About はページ実装時にここへ追加する。
export const NAV = [
  { label: 'Home', href: '/' },
  { label: 'Updates', href: '/updates' },
  { label: 'Podcast', href: '/podcast' },
  { label: 'Notes', href: '/notes' },
  // Photographyは独立棚(2026-07-10格上げ: Podcast/Notesと並ぶ存在に)
  { label: 'Photography', href: '/photography' },
  // Physical=物理的な作品のアーカイブ棚(2026-07-12、位置はPhotographyの右・Aboutの左)
  { label: 'Physical', href: '/physical' },
  { label: 'About', href: '/about' },
  // Contact=旧andyutaro.comの受注装置を移植(2026-07-12)
  { label: 'Contact', href: '/contact' },
] as const
