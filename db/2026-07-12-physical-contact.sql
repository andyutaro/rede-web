-- Physical棚 + Contactページ(2026-07-12)。Supabase SQL Editorで一度実行する。

-- articles.typeに'physical'を追加(物理的な作品のアーカイブ棚。物+軽い文章)
alter table articles drop constraint if exists articles_type_check;
alter table articles add constraint articles_type_check
  check (type in ('article', 'photography', 'physical'));

-- 問い合わせの受け皿(Contactフォーム)。挿入はAPI(service role)が行うため
-- anonのポリシーは作らない。閲覧・既読・削除は認証済み(=studioのCONTACT室)のみ
create table if not exists contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  topics text[] not null default '{}',
  message text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  deleted_at timestamptz
);

alter table contact_messages enable row level security;

drop policy if exists "authenticated all" on contact_messages;
create policy "authenticated all" on contact_messages
  for all to authenticated using (true) with check (true);
