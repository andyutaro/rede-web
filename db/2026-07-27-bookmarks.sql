-- ブックマーク室(2026-07-27): scribe/記事の本文に貼った外部リンクを集約し、
-- 「自分の文章に貼ったリンク=自分のブックマーク」として引けるようにする。
-- 行の出所は本文走査(lib/studio/bookmarks.ts)。本文からリンクが消えたら行も消える
-- (SSOTは本文。テーブルは索引+リンク先タイトルのキャッシュ)。
create table if not exists bookmarks (
  url text primary key,
  domain text not null,
  title text,                 -- リンク先ページのタイトル(取得失敗はnull)
  fetched_at timestamptz,     -- タイトル取得を試みた時刻(nullなら未取得)
  sources jsonb not null default '[]'::jsonb, -- 掲載元 [{kind,label,href,date}]
  context text,               -- 初出の周辺テキスト(なぜ貼ったかの手がかり)
  first_seen date,
  last_seen date,
  hidden boolean not null default false, -- 一覧から外す(本文は触らない)
  created_at timestamptz not null default now()
);

alter table bookmarks enable row level security;

-- studio専用: 読みは認証済みのみ。書き込みはservice role(API/cron)のみなので
-- 書き込みポリシーは作らない
create policy "authenticated read bookmarks"
  on bookmarks for select to authenticated using (true);
