-- deskの「直前の版」をサーバー側に持つ(2026-08-16)。Supabase SQL Editorで一度実行する。
--
-- 目的: 端末のlocalStorageに頼らず本文を戻せるようにする。2026-08-16のテキスト
-- 消失は端末の退避で救えたが、それは「その端末を触れる」場合に限る。
--
-- 設計の要点:
-- ・別テーブルにする。scribe_daysに列を足すと、既存の select('*')(Notes一覧・
--   desk個別ページ等)が毎回この本文まで運ぶことになり、CPUと転送が倍になる
-- ・保存APIは触らない。**トリガでDB側だけで完結**させる=保存の往復もWorkerの
--   CPUも1msも増えない(保存は打鍵中1.5秒ごとに走るので、ここは増やせない)
-- ・毎回の保存では残さない。**本文が大きく縮むときだけ**残す。消失の署名は
--   「短くなること」なので、それだけを捉えれば書き込みは稀で済む
-- ・日付ごとに新しい10件だけ残す(青天井にしない)

create table if not exists scribe_day_versions (
  id bigserial primary key,
  date date not null,
  html text not null,
  saved_at timestamptz not null default now()
);

create index if not exists scribe_day_versions_date_idx
  on scribe_day_versions (date, saved_at desc);

alter table scribe_day_versions enable row level security;

-- 本人(認証済み)だけが読み書きできる。公開読み取りポリシーは作らない
drop policy if exists "authenticated all" on scribe_day_versions;
create policy "authenticated all" on scribe_day_versions
  for all to authenticated using (true) with check (true);

-- 本文が大きく縮む更新の直前に、消える側(OLD.html)を1件残す。
-- security definer: 保存はauthenticatedロールで走るので、RLSに関係なく
-- 確実に記録できるようにする(退避が失敗しては意味がない)
create or replace function scribe_days_keep_shrink_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.html is not null
     and NEW.html is distinct from OLD.html
     and length(OLD.html) > 400
     and length(NEW.html) < length(OLD.html) * 0.7
  then
    insert into scribe_day_versions (date, html) values (OLD.date, OLD.html);
    -- その日の版は新しい10件だけ残す
    delete from scribe_day_versions
     where date = OLD.date
       and id not in (
         select id from scribe_day_versions
          where date = OLD.date
          order by saved_at desc
          limit 10
       );
  end if;
  return NEW;
end;
$$;

drop trigger if exists scribe_days_shrink_version on scribe_days;
create trigger scribe_days_shrink_version
  before update on scribe_days
  for each row
  execute function scribe_days_keep_shrink_version();
