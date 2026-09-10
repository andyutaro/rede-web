-- ゲスト出演(2026-09-10 Andy指定)。Supabase SQL Editorで一度実行する。
--
-- Andyが他番組にゲストとして出た回を、Podcast棚の第3群 GUEST に載せる。
--
-- 設計の要:
-- ・**本体はRSSが真実。** ここが持つのは「どのフィードの、どの回か」だけ
--   (episode_tagsと同じ考え方)。題名・日付・尺・音源・カバーは毎回RSSから引く
-- ・ただし**控えを持つ**。フィードから回が落ちる/取得に失敗すると表示ごと
--   消えてしまうため、題名・番組名・公開日・尺だけ保存時の値を残しておく
-- ・並びは「サイトに追加した日」ではなく**エピソードの公開日(published_at)**降順
--   (2026-09-10 Andy指定)。created_atは並びに使わない
-- ・Spotify URLは送客ボタンの行き先として持つ(音源はRSSのenclosureから鳴らす。
--   Spotify埋め込みは非ログイン訪問者にプレビューしか鳴らさないため使わない)
create table if not exists guest_episodes (
  id uuid primary key default gen_random_uuid(),
  -- 出演した番組のRSS(Anchor等)。同じ番組の2回目以降はこれを再利用する。
  -- **Spotify独占配信の番組はRSSが存在しない**のでnull可(2026-09-10)。
  -- その回は音源を持てないので、ページは送客ボタンだけになる
  feed_url text,
  -- フィード内でこの回を特定する鍵。値は podcastFeed の Episode.id
  -- (=linkの末尾のAnchor episode ID。無ければguid先頭8文字)。自分の番組の
  -- エピソードURLと同じ鍵の作り方に揃えてある。RSSが無い回はnull
  episode_guid text,
  -- 送客ボタンの行き先。RSSが無い回はここだけが聴く手段になる
  spotify_url text,
  -- 以下は表示用の控え。RSSが引けたときはRSSの値を優先する。
  -- RSSが無い回は**ここが唯一の真実**(Spotifyの埋め込みJSONから取る)
  show_name text not null default '',
  title text not null default '',
  published_at date,
  duration text,
  image_url text,
  created_at timestamptz not null default now(),
  -- 2段階削除(このプロジェクトの他の棚と同じ作法)
  deleted_at timestamptz
);

-- 同じ回を二重に登録しない。RSS由来の回はfeed+id、RSSが無い回はSpotify URLで見る。
--
-- **部分索引(where ...)にしないこと**(2026-09-10、一度やって踏んだ)。
-- ON CONFLICT は部分索引を推論に使えず、保存が
-- 「there is no unique or exclusion constraint matching the ON CONFLICT
--  specification」で落ちる。
-- そして部分索引にする必要は元々ない——**Postgresはnullを互いに異なるものとして
-- 扱う**ので、素の一意索引でちょうど狙いどおりになる:
--   ・feed_urlがnullの行(Spotify限定)は (feed_url, episode_guid) で衝突しない
--   ・spotify_urlがnullの行(RSS直貼り)は spotify_url で衝突しない
-- 一度張ってしまった部分索引を捨てるためにdropを先に置く(何度実行しても安全)
drop index if exists guest_episodes_feed_guid_idx;
drop index if exists guest_episodes_spotify_idx;

create unique index if not exists guest_episodes_feed_guid_idx
  on guest_episodes (feed_url, episode_guid);

create unique index if not exists guest_episodes_spotify_idx
  on guest_episodes (spotify_url);

-- 棚の並び(公開日降順)がそのまま引ける
create index if not exists guest_episodes_published_idx
  on guest_episodes (deleted_at, published_at desc);

-- 既に旧い形で作ってしまった場合の追いつき(何度実行しても安全)
alter table guest_episodes alter column feed_url drop not null;
alter table guest_episodes alter column episode_guid drop not null;
alter table guest_episodes add column if not exists image_url text;

alter table guest_episodes enable row level security;

-- 公開側は誰でも読める(棚に出るもの)。削除済みの除外はクエリ側で行う
drop policy if exists "public read guest_episodes" on guest_episodes;
create policy "public read guest_episodes" on guest_episodes
  for select using (true);

-- 書き込みは認証済み(=Andy)のみ
drop policy if exists "authenticated write guest_episodes" on guest_episodes;
create policy "authenticated write guest_episodes" on guest_episodes
  for all to authenticated using (true) with check (true);
