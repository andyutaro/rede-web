-- deskのprivate(非公開メモ、2026-08-16 Andy指定)。Supabase SQL Editorで一度実行する。
--
-- Macのスティッキーズの置き換え。タブを好きなだけ増やして、外に出ない文章を書く。
--
-- **公開されないことの担保は3つ、すべて構造で持つ**:
-- ①このテーブルを読む公開ページのクエリを一切作らない(公開側はテーブル名を
--   名指しで引くので、新しいテーブルが勝手に混ざることはない)
-- ②RLSは認証済みのみ。public readポリシーを**作らない**(scribe_days等と違う点)
-- ③中継(ライブ配信)へ流さない。deskの放送卓とは別の画面・別の保存経路にする
create table if not exists desk_private_notes (
  id uuid primary key default gen_random_uuid(),
  html text not null default '',
  -- タブの並び順(小さいほど左)。新規は末尾に置く
  sort_order double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 2段階削除(このプロジェクトの他の棚と同じ作法)。書いたものは即座に消さない
  deleted_at timestamptz
);

create index if not exists desk_private_notes_order_idx
  on desk_private_notes (deleted_at, sort_order);

alter table desk_private_notes enable row level security;

-- 認証済み(=Andy本人)だけ。**public readは作らない**
drop policy if exists "authenticated all" on desk_private_notes;
create policy "authenticated all" on desk_private_notes
  for all to authenticated using (true) with check (true);
