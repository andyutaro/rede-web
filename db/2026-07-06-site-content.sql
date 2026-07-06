-- 編集可能なサイト文言の格納先(管理画面から編集するAbout等)。
-- 構造化コンテンツをkeyごとにJSONBで持つ。Supabase SQL Editorで一度実行する。
-- 未実行でも公開サイトは動く(getAboutContentがDEFAULT_ABOUTにフォールバックする)。
create table if not exists site_content (
  key text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table site_content enable row level security;

-- 公開読み取り(誰でも)
drop policy if exists "public read" on site_content;
create policy "public read" on site_content
  for select using (true);

-- 書き込みは認証済みセッションのみ(scribe_daysと同じ作法。service_roleは使わない)
drop policy if exists "auth insert" on site_content;
create policy "auth insert" on site_content
  for insert to authenticated with check (true);

drop policy if exists "auth update" on site_content;
create policy "auth update" on site_content
  for update to authenticated using (true) with check (true);
