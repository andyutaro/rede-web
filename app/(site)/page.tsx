import Link from 'next/link'
import { createService } from '@/lib/supabase/service'
import { todayInTokyo } from '@/lib/scribe/date'
import { recentUpdates } from '@/lib/site/updates'
import { listAllImages, randomOf } from '@/lib/site/photos'
import { SHOWS } from '@/lib/site/shows'
import { channelInfo } from '@/lib/site/podcastFeed'
import CoverGrid from './CoverGrid'
import LiveWindow from './LiveWindow'
import UpdateList from './UpdateList'

// ライブ・ランダム写真・当日行はリクエストごとに変わるので静的化しない
export const dynamic = 'force-dynamic'

// Home構成(handoff-notes §2、上から):
// ワードマーク/ナビ(layout) → Podcast Original → Podcast Works →
// UPDATES → scribe窓 → Photography → Tags → フッター(layout)
export default async function Home() {
  const today = todayInTokyo()
  const service = createService()

  const [todayRes, updates, images, covers] = await Promise.all([
    service.from('scribe_days').select('html').eq('date', today).maybeSingle(),
    recentUpdates(10),
    listAllImages(),
    // 番組カバー+最新エピソード日付はRSSから自動取得
    // (カバーは番組全体のアート。エピソード画像ではない)
    Promise.all(
      SHOWS.map((s) =>
        s.feed ? channelInfo(s.feed, s.since) : Promise.resolve({ image: null, latest: null })
      )
    ),
  ])

  const initialHtml = todayRes.data?.html || null
  const photo = randomOf(images)
  // カバーが取れた番組だけ出す(フィード未設定・取得失敗はプレースホルダを出さない)。
  // 並びは各群とも最新エピソードが新しい順(左が最新)
  const withArt = SHOWS.map((s, i) => ({
    ...s,
    cover: covers[i].image,
    latest: covers[i].latest,
  }))
    .filter((s): s is typeof s & { cover: string } => Boolean(s.cover))
    .sort((a, b) => (b.latest ?? '').localeCompare(a.latest ?? ''))
  const originals = withArt.filter((s) => s.group === 'original')
  const works = withArt.filter((s) => s.group === 'works')

  return (
    <div className="measure">
      {originals.length > 0 && <CoverGrid heading="PODCAST — ORIGINAL" shows={originals} />}
      {works.length > 0 && <CoverGrid heading="PODCAST — WORKS" shows={works} />}

      <section className="section">
        <div className="section-head">
          <span>UPDATES — LAST 10 DAYS</span>
          <Link href="/updates">ALL UPDATES →</Link>
        </div>
        <div className="section-body">
          <UpdateList rows={updates} />
        </div>
      </section>

      <LiveWindow
        relay={process.env.SCRIBE_RELAY_URL ?? null}
        today={today}
        initialHtml={initialHtml}
      />

      {/* 見出しはPhotographyのまま存続(§11: Homeの統一感を優先する司令塔決定)。
          母集団はサイト内の全アップロード写真 */}
      {photo && (
        <section className="section">
          <div className="section-head">
            <span>PHOTOGRAPHY</span>
          </div>
          <div className="section-body photo-single">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" />
          </div>
        </section>
      )}

      {/* Tags(§7)は手動タグ付け開始まで非表示(ダミー不可)。タグ実装時にここへ */}
    </div>
  )
}
