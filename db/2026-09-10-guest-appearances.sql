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
  -- 出演した番組のRSS(Anchor等)。同じ番組の2回目以降はこれを再利用する
  feed_url text not null,
  -- フィード内でこの回を特定する鍵。値は podcastFeed の Episode.id
  -- (=linkの末尾のAnchor episode ID。無ければguid先頭8文字)。自分の番組の
  -- エピソードURLと同じ鍵の作り方に揃えてある
  episode_guid text not null,
  -- 送客ボタンの行き先(任意。RSSを直接貼って登録した場合はnull)
  spotify_url text,
  -- 以下は表示用の控え。RSSが引けたときはRSSの値を優先する
  show_name text not null default '',
  title text not null default '',
  published_at date,
  duration text,
  created_at timestamptz not null default now(),
  -- 2段階削除(このプロジェクトの他の棚と同じ作法)
  deleted_at timestamptz
);

-- 同じ回を二重に登録しない
create unique index if not exists guest_episodes_feed_guid_idx
  on guest_episodes (feed_url, episode_guid);

-- 棚の並び(公開日降順)がそのまま引ける
create index if not exists guest_episodes_published_idx
  on guest_episodes (deleted_at, published_at desc);

alter table guest_episodes enable row level security;

-- 公開側は誰でも読める(棚に出るもの)。削除済みの除外はクエリ側で行う
drop policy if exists "public read guest_episodes" on guest_episodes;
create policy "public read guest_episodes" on guest_episodes
  for select using (true);

-- 書き込みは認証済み(=Andy)のみ
drop policy if exists "authenticated write guest_episodes" on guest_episodes;
create policy "authenticated write guest_episodes" on guest_episodes
  for all to authenticated using (true) with check (true);
