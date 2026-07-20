// ナビは実在ページのみ載せる(2026-07-04司令塔決定)。
// 最終形は Home / Updates / Podcast / Notes / Tags / About の6項目
// (Article棚は2026-07-10にNotesへ改名: scribe/article/photographyを含む棚名)。
// Podcast / Tags / About はページ実装時にここへ追加する。
export const NAV = [
  { label: 'Home', href: '/' },
  // AboutはHomeの次(2026-07-13 Andy指定)
  { label: 'About', href: '/about' },
  { label: 'Updates', href: '/updates' },
  { label: 'Podcast', href: '/podcast' },
  { label: 'Notes', href: '/notes' },
  // Photographyは独立棚(2026-07-10格上げ: Podcast/Notesと並ぶ存在に)
  { label: 'Photography', href: '/photography' },
  // Physical=物理的な作品のアーカイブ棚(2026-07-12)
  { label: 'Physical', href: '/physical' },
  // Membership=rooomの援護導線(2026-07-13、旧andyutaro.comから移植)
  { label: 'Membership', href: '/membership' },
  // Contact=旧andyutaro.comの受注装置を移植(2026-07-12)
  { label: 'Mail', href: '/contact' },
] as const
