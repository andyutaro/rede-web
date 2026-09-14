// Cloudflare Workersのカスタムエントリ(2026-07-22)。
// OpenNext生成のfetchハンドラをそのまま使い、scheduled(Cron Triggers)を足す。
// cron: 毎日15:01 UTC(=0:01 JST)にscribe確定(/api/cron/finalize)。Vercel Cron
// からの移管で二重運用を終える。ルート側のCRON_SECRET検証はそのまま活かし、
// ネットワークを経由せずワーカー内で自分のfetchハンドラを直接呼ぶ。

import handler from './.open-next/worker.js'

// Durable Objectクラスはmainエントリから再exportされている必要がある
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from './.open-next/worker.js'

const worker = {
  fetch: handler.fetch,

  async scheduled(controller, env, ctx) {
    // cronは2本(wrangler.jsonc)。どの時刻の起動かで行き先を分ける。
    // - "1 15 * * *"   … 0:01 JSTの確定(finalize)
    // - "31 */3 * * *" … 3時間ごとの写真の控え(2026-09-14)。夜の確定は上限を他の仕事と
    //                   分け合うので1晩6枚が限界で、写真をまとめて上げると追いつかなかった
    const path = controller.cron === '31 */3 * * *' ? '/api/cron/backup-photos' : '/api/cron/finalize'
    const req = new Request(`https://andyutaro.com${path}`, {
      headers: { authorization: `Bearer ${env.CRON_SECRET ?? ''}` },
    })
    const res = await handler.fetch(req, env, ctx)
    // Workers Logsで実行結果を追えるようにする(数字ではなく成否の記録)
    console.log('cron', path, controller.cron, res.status, await res.text())
  },
}

export default worker
