-- 波形の生きもの=「今日来てくれた人」(2026-08-07 Andy指定)。Supabase SQL Editorで一度実行する。
-- サイトが開かれるたびに、その時に生えた線画の種類を1行だけ記録する。
-- deskのアーカイブと当日ページの末尾に、その日の分を時間順に並べて出す。
--
-- 持たないもの: 誰か(IP・UA・識別子)、どのページか、何回見たか。
-- 「いつ・どの絵が出たか」だけ。日をまたいだ追跡ができない形にしてある。
create table if not exists arrivals (
  id bigserial primary key,
  -- 東京の日付(日の区切りはdeskの確定と同じ)。APIが計算して入れる
  day date not null,
  -- 線画の種類(0..9、waveCreatures.tsのSHAPES順)
  kind smallint not null,
  created_at timestamptz not null default now()
);

-- その日の分を時間順に引く
create index if not exists arrivals_day_idx on arrivals (day, created_at);

alter table arrivals enable row level security;

-- 公開読み取り(表示に使う)。書き込みポリシーは作らない=
-- 直POSTでの荒らし面を作らず、記録は必ずservice roleのAPI(/api/arrive)を通す
drop policy if exists "public read" on arrivals;
create policy "public read" on arrivals for select using (true);

drop policy if exists "authenticated all" on arrivals;
create policy "authenticated all" on arrivals
  for all to authenticated using (true) with check (true);
