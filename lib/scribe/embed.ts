// ポッドキャスト/動画URLの埋め込みカード化パターン(旧scribeから移植)。
// ホストは/watchのサニタイザのホワイトリスト
// (open.spotify.com / embed.podcasts.apple.com / www.youtube.com)と一致させること。
const PODCAST_PATTERNS: { re: RegExp; embed: (m: RegExpMatchArray) => string; height: number }[] = [
  {
    re: /https?:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?episode\/([a-zA-Z0-9]+)/,
    embed: (m) => `https://open.spotify.com/embed/episode/${m[1]}`,
    height: 152,
  },
  {
    re: /https?:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?show\/([a-zA-Z0-9]+)/,
    embed: (m) => `https://open.spotify.com/embed/show/${m[1]}`,
    height: 152,
  },
  {
    re: /https?:\/\/podcasts\.apple\.com\/[^\s]+/,
    embed: (m) => m[0].replace('podcasts.apple.com', 'embed.podcasts.apple.com'),
    height: 175,
  },
  {
    re: /https?:\/\/(www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
    embed: (m) => `https://www.youtube.com/embed/${m[2]}`,
    height: 200,
  },
  {
    re: /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]+)/,
    embed: (m) => `https://www.youtube.com/embed/${m[1]}`,
    height: 200,
  },
]

export function embedConfigFor(url: string): { src: string; height: number } | null {
  for (const p of PODCAST_PATTERNS) {
    const m = url.match(p.re)
    if (m) return { src: p.embed(m), height: p.height }
  }
  return null
}

export function isBareUrl(text: string): boolean {
  return /^https?:\/\/\S+$/.test(text.trim())
}
