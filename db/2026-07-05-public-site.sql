-- フェーズ2公開サイト: articlesテーブル(受け皿)とサムネイル固定用の列。
-- Supabase SQL Editorで一度実行する。実行前でも公開サイトは動く
-- (articlesは空扱い、充当サムネイルはハッシュによる決定的選択で代替)。

-- articles: 管理画面フェーズ前の受け皿。未移行15件はdraftで投入する。
-- type列(handoff-notes §11): 投稿時デフォルトarticle、ダッシュボードでいつでも変更可。
-- scribeはscribe_days由来なのでここには入らない。
create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  html text not null default '',
  type text not null default 'article' check (type in ('article', 'photography')),
  status text not null default 'draft' check (status in ('draft', 'published')),
  thumbnail_url text,
  thumbnail_source text check (thumbnail_source in ('first_image', 'assigned', 'manual')),
  published_at timestamptz,
  created_at timestamptz not null default now()
);

alter table articles enable row level security;

-- 公開読み取りはpublishedのみ(draftは漏らさない)
drop policy if exists "public read published" on articles;
create policy "public read published" on articles
  for select using (status = 'published');

-- scribe_days: 充当サムネイルの「一度決まったら固定」用(handoff-notes §11)
alter table scribe_days
  add column if not exists thumbnail_url text,
  add column if not exists thumbnail_source text
    check (thumbnail_source in ('first_image', 'assigned', 'manual'));
