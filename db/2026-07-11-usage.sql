-- studioのUSAGE室(2026-07-11): 無料枠に対するDB使用量の取得関数。
-- Supabase SQL Editorで一度実行する。
-- PostgRESTからは生SQLが打てないため、DBサイズ・テーブル別サイズを
-- security definerの関数にして認証済みユーザーだけに公開する。
create or replace function studio_usage()
returns json
language sql
security definer
set search_path = public
as $$
  select json_build_object(
    'db_bytes', pg_database_size(current_database()),
    'tables', (
      select coalesce(json_agg(t), '[]'::json) from (
        select
          c.relname as name,
          pg_total_relation_size(c.oid) as bytes,
          coalesce(s.n_live_tup, 0) as rows
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        left join pg_stat_user_tables s on s.relid = c.oid
        where n.nspname = 'public' and c.relkind = 'r'
        order by pg_total_relation_size(c.oid) desc
      ) t
    )
  );
$$;

revoke execute on function studio_usage() from public;
revoke execute on function studio_usage() from anon;
grant execute on function studio_usage() to authenticated;
