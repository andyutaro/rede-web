-- Updates手動投稿(2026-07-11、studioのUPDATES室)。Supabase SQL Editorで一度実行する。
-- 「新しく生まれたものだけが流れる」の手動枠(仕様: 管理画面から手動投稿も可能)。
-- ラベル(種別列)と本文(タイトル列)、任意のリンク先を持つ1行。
-- 削除は他と同じ2段階(deleted_at=ゴミ箱)。
create table if not exists manual_updates (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  label text not null default 'NEWS',
  body text not null,
  href text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table manual_updates enable row level security;

-- 公開読み取り(表示側はゴミ箱をコードで除外)。書き込みは認証済みのみ
drop policy if exists "public read" on manual_updates;
create policy "public read" on manual_updates for select using (true);

drop policy if exists "authenticated all" on manual_updates;
create policy "authenticated all" on manual_updates
  for all to authenticated using (true) with check (true);
