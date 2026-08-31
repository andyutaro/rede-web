// Cloudflare Workers本番設定。
// ISRの永続キャッシュ(2026-07-23): これが無い間、ページは毎リクエストで丸ごと
// 再生成されていた(x-nextjs-cache: MISS が常時)。/podcastは301枚のタイルを
// 毎回組み直しており、これがCPU時間の重い尾(上位1%で200〜700ms)の正体で、
// 無料プランの10ms制限を時々超えてError 1102を出していた。
// R2に確定結果を置き、拠点内の短期キャッシュ(regional cache)を前段に重ねる。
import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'
import { withRegionalCache } from '@opennextjs/cloudflare/overrides/incremental-cache/regional-cache'
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue'

export default defineCloudflareConfig({
  // long-lived: ISR/SSGの結果を拠点内で最大30分再利用する(ページのrevalidateと同じ幅)。
  // R2への往復すら省けるので、温まった拠点ではほぼ処理ゼロで返る
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: 'long-lived' }),

  // ISRの作り直しキュー(2026-08-31)。指定が無いと既定値は "dummy" ——
  // send()が必ず例外を投げるだけの空実装で、裏側の作り直しは一度も成功して
  // いなかった(1日1,087件のFailed to revalidate stale page)。ページが古いまま
  // 残り、「保存したのに反映されない」もこれが原因。
  // Durable Object版を使う(理由と無料プランの制約はwrangler.jsoncに記載)
  queue: doQueue,
})
