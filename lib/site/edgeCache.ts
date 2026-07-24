// 計算結果のエッジキャッシュ(2026-07-24)。
// 無料プランのCPU制限(10ms/リクエスト)対策。DBの全文走査や正規表現パースなど
// 重い計算の「結果(JSON)」を拠点毎にキャッシュし、コールドなisolateでも
// JSON.parseだけで返せるようにする。podcastFeedで先に使った手を共通化した。
//
// 動的ページ(force-dynamic)でも使える点が肝: ページ自体は毎回描くが、その材料は
// キャッシュから取る。ランダム写真の「訪問ごとに変わる」等の体験は保ったまま軽くなる。
//
// Cache APIはWorkersランタイムのみ。Node dev/ビルド時には存在しないので、
// その場合はキャッシュを素通りして毎回計算する(挙動は同じ、遅いだけ)。

type EdgeCache = {
  match(key: string): Promise<Response | undefined>
  put(key: string, res: Response): Promise<void>
}

function edgeCache(): EdgeCache | null {
  const c = (globalThis as { caches?: { default?: EdgeCache } }).caches
  return c?.default ?? null
}

// name: キャッシュの論理名(内部URLの一部になる)。形が変わったら v を上げる
// ttlSec: 何秒キャッシュするか。compute: キャッシュが無いとき走る重い計算
export async function cachedJson<T>(
  name: string,
  ttlSec: number,
  compute: () => Promise<T>
): Promise<T> {
  const edge = edgeCache()
  const key = `https://compute-cache.internal/v1/${name}`
  if (edge) {
    try {
      const hit = await edge.match(key)
      if (hit) return (await hit.json()) as T
    } catch {
      // キャッシュ不調時は素通りして計算経路へ
    }
  }
  const value = await compute()
  if (edge) {
    try {
      await edge.put(
        key,
        new Response(JSON.stringify(value), {
          headers: {
            'content-type': 'application/json',
            'cache-control': `max-age=${ttlSec}`,
          },
        })
      )
    } catch {
      // 書き込み失敗は無視(次のリクエストが再計算するだけ)
    }
  }
  return value
}
