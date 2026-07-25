// パンくずの構造化データ(2026-07-25): 検索結果でURLの代わりに
// 「andyutaro.com › Podcast › サカナカイギ」のような階層表示を出すためのJSON-LD。
// 見た目のパンくずは置かない(ミニマルの原則。マークアップだけでGoogleは読む)。
// 語彙はナビと同じ(Home / Podcast / Notes / Photography / Physical)
export function breadcrumbJsonLd(items: { name: string; path: string }[]): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `https://andyutaro.com${it.path}`,
    })),
  }).replace(/</g, '\\u003c')
}
