-- 管理画面 /studio (2026-07-09司令塔承認: Tiptap廃止・SSOT生HTML一本化)。
-- Supabase SQL Editorで一度実行する。

-- articles: 管理画面からの執筆・編集に必要な列とポリシーを追加。
-- tags=手動タグ(横断タグの受け皿)、updated_at=楽観ロック用(scribe_daysと同方式)。
alter table articles
  add column if not exists tags text[] not null default '{}',
  add column if not exists updated_at timestamptz not null default now();

-- 書き込みは認証済みユーザーのみ(利用者はAndy一人)。draftの読み取りもここで許可される
drop policy if exists "authenticated all" on articles;
create policy "authenticated all" on articles
  for all to authenticated using (true) with check (true);

-- episode_tags: RSS取り込みエピソードへの手動タグ付け(Podcast Inbox)。
-- エピソード本体はRSSが真実なのでDBに複製しない。タグだけを(番組slug, エピソードID)で持つ。
create table if not exists episode_tags (
  show_slug text not null,
  episode_id text not null,
  tags text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (show_slug, episode_id)
);

alter table episode_tags enable row level security;

-- タグは公開情報(将来のタグページで使う)。書き込みは認証済みのみ
drop policy if exists "public read" on episode_tags;
create policy "public read" on episode_tags for select using (true);

drop policy if exists "authenticated write" on episode_tags;
create policy "authenticated write" on episode_tags
  for all to authenticated using (true) with check (true);
