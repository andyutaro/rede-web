import type { MetadataRoute } from 'next'

// robots.txt(2026-07-23)。
// AIクローラーは通す(Andy判断): ポッドキャスターとしての仕事がAIの参照先に
// 入ることの方が、学習に使われないことより価値がある。Cloudflareが既定で
// GPTBot・Google-Extended・meta-externalagentを塞いでいたのを開ける意図。
// ※Cloudflare側のManaged robots.txtがエッジで差し込まれる場合はそちらが勝つ。
//   その時はダッシュボードの設定を切る必要がある(要Andy操作)。
//
// 非公開・私的な口は通さない: 編集室(studio)・放送卓(desk)・API・
// その日限りの生放送(live)・検索(道具)。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/studio', '/desk', '/api/', '/live', '/search', '/login'],
      },
    ],
    sitemap: 'https://andyutaro.com/sitemap.xml',
    host: 'https://andyutaro.com',
  }
}
