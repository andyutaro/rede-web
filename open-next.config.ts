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
import type { Queue } from '@opennextjs/aws/types/overrides'

// **作り直しの依頼で読者を待たせない(2026-09-03)。**
//
// ページが古いと判定されると、リクエストの中で `await queue.send()` が走り、
// Durable Objectを呼びに行く。`/`の作り直しはパスのハッシュで**1つのDOに固定**
// されるので、そのDOが詰まると「古い」と判定した全リクエストがそこで待つ。
// 実測(2026-09-03、直近12時間のHEAD呼び出しサマリ50件): 全部が
// CPU 2ms・wall 50秒・canceled。描いていない、DOを待っているだけだった。
//
// 依頼は落としてよい。ページが古いままなら次に来た人がまた投げる。
// **詰まったDOが読者を巻き込まないことのほうが、依頼1通より重い。**
// これは作り直しを成功させる修正ではなく、失敗が波及しないようにする遮断器。
function nonBlocking(queue: Queue, ms = 1000): Queue {
  return {
    name: `nonblocking-${queue.name}`,
    send: async (msg) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          queue.send(msg),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('queue send timeout')), ms)
          }),
        ])
      } catch {
        // 握りつぶす。ここで投げると呼び出し元の描画を巻き添えにする
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

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
  // 三段重ね。外から順に:
  // - nonBlocking … 詰まったDOで読者を待たせない(上の注記)
  // - queueCache … 同じ依頼を何度も投げない(2026-09-02)。期限切れの間、来た
  //   リクエストの数だけ同じ依頼が積まれていた。TTLは60秒(古さ1つにつき1分に1通。
  //   Homeのrevalidateを1時間へ延ばした後も、畳む窓は短いままでよい)
  // - doQueue … 本体
  queue: nonBlocking(queueCache(doQueue, { regionalCacheTtlSec: 60 })),
})
