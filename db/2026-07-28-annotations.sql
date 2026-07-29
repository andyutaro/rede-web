-- 脚注・注釈(2026-07-28 Andy指定): 本文の一部をドラッグして、後から欄外注釈を足す。
--
-- 設計の要:
-- - **本文(SSOT)には一切触れない。** 注釈は別レイヤー。記法もタグも本文に増やさない
--   (Markdown廃止の原則を裏口から破らないため)。消せば跡形もなく消える。
-- - アンカーは「ブロックID + ブロック内の文字オフセット + 引用文字列」の3点。
--   本文を後から編集してもズレを吸収できるよう、引用文字列で再探索する
--   (W3C Web Annotationのtext quote selectorと同じ考え方)。
--   どうしても見つからない注釈は「迷子」として本文には出さず、編集時にだけ見せる。
create table if not exists annotations (
  id uuid primary key default gen_random_uuid(),
  -- 対象: scribeは日付(YYYY-MM-DD)、記事はarticles.id
  target_kind text not null check (target_kind in ('scribe', 'article')),
  target_key text not null,
  -- アンカー
  block_id text not null,
  start_offset integer not null default 0,
  quote text not null,
  -- 注釈本文
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists annotations_target_idx
  on annotations (target_kind, target_key)
  where deleted_at is null;

alter table annotations enable row level security;

-- 読み書きともservice role経由(公開ページはサーバー側で読み、書き込みはAPIが
-- セッション検証してから行う)。anonの直接アクセスは開けない
