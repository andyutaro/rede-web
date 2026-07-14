// Cloudflare Workers移行スパイク(2026-07-14)。andyutaro.com紐付けの
// 移行先候補としてOpenNextアダプタが改変版Next 16.2.10で通るかの検証用。
// 本採用時はR2のincremental cache(ISR永続化)をここに足す。
import { defineCloudflareConfig } from '@opennextjs/cloudflare'

export default defineCloudflareConfig()
