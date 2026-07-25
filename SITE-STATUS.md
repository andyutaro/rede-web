# andyutaro.com — サイト現状の共有メモ（2026-07-24 時点）

> このファイルは、別のClaude（claude.ai のチャット等）に今のサイトの状況を伝えるための自己完結メモです。前提知識ゼロで読める形で書いています。作業用の詳細な規約は別途 `AGENTS.md` / `CLAUDE.md` にあります。

---

## これは何のサイトか

**Andy（安田悠太郎）のポッドキャスター/クリエイターとしての個人サイト**。本番は **https://andyutaro.com**。
杉本博司的な「静けさ・細字・余白・グレースケール（彩色は生放送中を示すLIVE赤のみ）」を核にした、極端にミニマルなデザイン。

サイトの目的は「時々気になって訪ねたくなる場所」であること。ポッドキャストの連続再生と、日々書く「scribe（読むポッドキャスト＝生放送で書き一日の終わりに確定するテキスト）」が再訪の理由になっている。

---

## 技術スタック

- **Next.js 16.2.10（改変版）** + React 19 + TypeScript。※通常のNextと異なる breaking change があり、`node_modules/next/dist/docs/` を読んでから書く規約。`middleware.ts` ではなく `proxy.ts` 系。Markdownは全面廃止（本文は独自HTML）。
- **ホスティング: Cloudflare Workers**（OpenNext アダプタ `@opennextjs/cloudflare` 1.20.1 経由）。Vercelは 2026-07-24 に完全撤収済み（プロジェクト削除、旧URLは404）。
- **DB/認証/ストレージ: Supabase**（`@supabase/supabase-js` 2.110）。
- **デプロイ: `npm run deploy:cf`**（= opennextjs build && deploy）。ドメインは Cloudflare Custom Domain。
- 費用は**ドメイン代のみ**（月1150円予算の内側）。旧「STUDIOプラン」は解約済み。

## Cloudflare 周辺（重要な現状）

- 無料プラン。**CPU制限 10ms/リクエスト**。これが後述の Error 1102 の根本。
- **R2バケット2つ**: `rede-web-cache`（ISR永続キャッシュ）と `rede-web-backup`（後述のバックアップ）。
- **Cron Triggers**: 毎日 15:01 UTC（=0:01 JST）に `/api/cron/finalize`（scribe確定＋バックアップ＋孤児メディア掃除）。Vercel Cronから移管済み・稼働確認済み。
- **Workers Logs（observability）有効**。
- **Web Analytics 有効**（cookieなし・bot除外）。※運用ルール: **数字はAndyに見せない。月1でClaudeが読み、改善助言だけ渡す**。
- **robots.txt はアプリ側で管理**（`app/robots.txt`）。AIクローラーは許可（引用で名が届く方に価値、というAndy判断）。ただし Bytespider・CCBot は拒否。非公開の口（studio/desk/api/live/search/login）は全クローラー不可。
- Cloudflare Image Transformations で画像をエッジ変換（`/cdn-cgi/image/...`）。

---

## ページ構成

**公開（`app/(site)/`）**: `/`（Home） `/about` `/podcast` `/podcast/[slug]`（番組） `/podcast/[slug]/[episode]`（回） `/notes`（記事＋scribe一覧） `/notes/[id]` `/photography` `/photography/[id]` `/physical`（物理作品） `/physical/[id]` `/scribe/[date]`（確定scribe） `/live`（当日の生放送） `/updates` `/membership` `/contact`（CONTACT & OTAYORI） `/search` `/privacy`

**管理（要ログイン）**: `/desk`（scribeを書く場所。Andyはこれをデスクトップ/モバイルアプリ化して使う） `/studio/*`（記事・写真・物理・タグ・おたより・使用状況などの管理室）

**認証**: Supabase の magic link。サーバーコンポーネントのガードが唯一の門（旧proxy.tsは廃止）。

---

## 番組（`lib/site/shows.ts`、Anchor RSSから自動取得）

- **ORIGINAL（本人の番組）**: サカナカイギ / ミモリラジオ（終了番組）/ ガイロン（未配信）/ ロングポスト
- **WORKS（制作参加）**: ON-AIRDO / Brand Shift / オルタナティブフィッシング（未配信）
- 番組ごとにページの性質が違っていく方針。おたより・scribe裏面リンクは**継続中のオリジナル番組のみ**。ON-AIRDOだけは番組専用のGoogle Formへ外部遷移。
- **入門3選（STARTERS）**は全番組で設定可（studioの「入門」トグル）。

---

## データ（Supabaseの中にしかないもの＝失ったら戻らないもの）

- テーブル: `scribe_days`（日誌）, `articles`（記事・写真・物理を type で区別）, `episode_tags`, `contact_messages`, `site_content`, `manual_updates`
- ストレージ: `scribe-media`（本文の写真、現在89枚・約115MB）
- **RLS（行レベルセキュリティ）は全テーブル/ストレージで有効**。公開キーで読めるのは公開済みコンテンツのみ、書き込みは全拒否。2026-07-24にセキュリティ確認済み。
- **バックアップ**: 毎晩0:01のcronで `rede-web-backup`（R2）へ。文章は日付つきJSONで世代保存＋`text/latest.json`、写真は差分。Supabase無料プランには時点復旧が無いための備え。

---

## この数日（〜2026-07-24）にやったこと

- Cloudflare移行の総仕上げ（ドメイン紐付け・STUDIO解約・Vercel撤収・使用状況ダッシュボード）
- 連続再生（3番組均等の10本キュー）、PODCAST↔ON AIRピル、スマホ再生レイアウト
- CONTACT & OTAYORI 再編（仕事の相談＋番組へのおたより）、入門3選、ショーノートのリンク総修正
- エピソード/記事/scribe/写真の**個別OGP**、sitemap.xml、404・エラー画面を日本語化
- アクセシビリティ整備（`lang="ja"`、見出しタグ化、スクリーンリーダー用リンク名、フォーカス表示、prefers-reduced-motion対応）
- 画像高速化、ISR永続キャッシュ（R2）、フィード/写真プールのエッジキャッシュ化
- Web Analytics（数字非表示運用）、バックアップ、セキュリティ確認

---

## いま開いている論点・注意点

- **Error 1102（Worker exceeded resource limits）**: 無料プランのCPU 10ms超過で稀に発生。R2キャッシュとエッジキャッシュで大幅に減ったが、**force-dynamicなページ（Home/notes/updates/photography/physical/scribe/live/search）が毎回生成される構造**が残る要因。7/24にHomeの重い処理をエッジキャッシュ化。効果を様子見中。選択肢は「様子見」「残る動的ページをISR化（体感ほぼ不変・微妙な鮮度低下）」「Workers Paid $5/月でCPU上限30秒」の3つ。
- **X(Twitter)のOGPキャッシュ**: 7/23より前に共有したURLは、Xが旧・サイト共通画像をキャッシュしている。約1週間で自動更新、または `?s=1` を付ければ即再取得。コード側は正しい。
- **月次レビュー**: 毎月1日にClaudeがWeb Analyticsを読み、数字抜きの助言だけ渡す（スケジュールタスク化済み）。最初の意味あるデータは8月下旬〜9月。
- **サカナカイギ番組ページのヒーロー映像（2026-07-25、実装済み）**: 旧sakanakaigi.comのブランド（イワシの群れ映像）を番組ページ識別部の背後に沈め、波形がその上を泳ぐ形に。`shows.ts`の`heroVideo`（データ駆動、他番組はopt-in）。映像は`public/bg/sakanakaigi-school.{mp4,jpg}`（静的配信＝CPU非増）。**この1ページだけ「彩色はLIVE赤のみ」の確定ルールをAndy承認で曲げている**。元動画は`~/rede/泳ぐイワシ_website用.mp4`。調整の余地: 水の暗さ（veil 46%）・波形の見え方。**ループのギクシャク修正済み（2026-07-25）**: 初版は末尾→先頭が不連続でループのたびに絵が飛んだ。元動画から「末尾1.5秒を先頭1.5秒にクロスフェード」したシームレスループ版（5.7秒・1.6MB・crf27）を生成して差し替え。再生成する場合はffmpegのxfade（trim start=1.5 / duration=1.5, offset=4.19）で同じ手順。ポスターjpgも新しい先頭フレームから再生成済み。
- **番組ページの3点追加（2026-07-25後半、実装済み）**: ①おたより=継続中ORIGINAL番組ページに「番組へのおたよりを送る→」（`/contact?show=slug`、エピソードページ「この回への便り」の番組版。ON-AIRDOは既存の外部Google Formボタンのまま。ロングポストは項目持ちのため宛先プリセレクトなし=既存仕様） ②PRODUCTS節=`shows.ts`の`products`（physical記事IDの配列、並び順保持）を「PRODUCTS — 番組から生まれたもの」として2列グリッド（`.grid2`、モバイル1列272px中央）で表示。サムネイル解決はPhysical棚と同一。サカナカイギ=MADNESSルアー1件、ミモリラジオ=3件 ③番組の舞台=`shows.ts`の`place`（ja/coords/note）。番組ページ識別部の最後に場所+座標の銘板一行（**水を持つ番組でも水の外=紙の上**。マスクのフェード上では明色文字が沈むため）、Aboutに「PLACES — 番組の舞台」節（`placeRows()`、北から南の順）。女川38°27′N/白老42°32′N/北海道43°N（旅番組なので丸め）/NY⇄東京+「ビデオ通話で繋いで収録」注記。
- **観察メモ（未対応）**: サカナカイギの水の上の所属行「Andyのオリジナル番組」はフェード帯に重なりほぼ読めない（ヒーロー実装時から）。直すなら銘板と同じく水の外へ出すか、マスクのフェード開始位置をpx指定に変える。Andyの判断待ち。
- **デプロイ運用の注意**: `npm run deploy:cf`は通常これだけで100%公開されるが、途中で`wrangler versions deploy`を手動で挟むとWorkerが「バージョン上書きモード」に入り自動公開が止まる（7/23夜に踏んだ）。デプロイ後は`wrangler deployments list`で最新versionが(100%)か必ず確認する。
- **検証の注意**: Claude Codeのブラウザペインはエピソード/番組ページをハイドレートせず、JS計測（getBoundingClientRect等）が0や異常値を返すことがある。確実な検証は`~/rede/`でheadless Chrome + CDP（`--autoplay-policy=no-user-gesture-required`）を使う。スクリーンショットはペインでも撮れる。

## Andyの確定した好み・制約（重要）

- **「ラジオ/RADIO」という語を使わない**（本人が忌避）。代わりに PODCAST / ON AIR / 連続再生 / 放送。
- **アクセス数字を本人に見せない**（Claudeが読んで助言のみ）。
- **図鑑（タグ索引）・関連回は当面やらない。提案もしない**（判断済み）。
- **本番に破壊的なセキュリティ検証をしない**（読み取り専用で確認、書換・削除は事前許可）。
- 見た目を1pxも変えない改善は歓迎。装飾・ラベルの追加は歓迎されない。ミニマルさが最優先。
