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
import queueCache from '@opennextjs/cloudflare/overrides/queue/queue-cache'

export default defineCloudflareConfig({
  // long-lived: ISR/SSGの結果を拠点内で最大30分再利用する(ページのrevalidateと同じ幅)。
  // R2への往復すら省けるので、温まった拠点ではほぼ処理ゼロで返る
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: 'long-lived' }),

  // ISRの作り直しキュー(2026-08-31)。指定が無いと既定値は "dummy" ——
  // send()が必ず例外を投げるだけの空実装で、裏側の作り直しは一度も成功して
  // いなかった(1日1,087件のFailed to revalidate stale page)。ページが古いまま
  // 残り、「保存したのに反映されない」もこれが原因。
  // Durable Object版を使う(理由と無料プランの制約はwrangler.jsoncに記載)。
  //
  // **同じ依頼を何度も投げない(2026-09-02)。** ISRの期限が切れている間、
  // 来たリクエストの数だけ「作り直して」がキューへ飛ぶ。Homeは60秒で切れて
  // botが叩き続けるので、同じ1件の作り直しが何百通も積まれていた。
  // それが失敗すると全部が失敗状態に溜まり、alarmがまとめて実行して
  // サブリクエスト枠(50本)を越える。前段で畳んでおけば依頼は1通で済む。
  // TTLはHomeのrevalidate(60秒)に合わせる=1つの古さにつき1通
  queue: queueCache(doQueue, { regionalCacheTtlSec: 60 }),
})
