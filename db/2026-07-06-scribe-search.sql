-- scribeアーカイブの全文検索(日本語)。
-- Postgres標準のtsvectorは空白区切り前提で日本語を語に分割できないため、
-- pg_trgm(トライグラム)による部分一致検索を使う。「釧路」のような部分文字列が
-- 本文のどこにあっても引ける。Supabase SQL Editorで一度実行する。
-- 未実行でも検索は動く(索引なしのILIKE順次走査。件数が小さいうちは十分速い)。
create extension if not exists pg_trgm;

-- html全文へのGINトライグラム索引。ILIKE '%語%' を高速化する。
-- scribe htmlはタグ+テキスト+URLで、日本語の検索語がタグ名に誤一致することはない。
create index if not exists scribe_days_html_trgm
  on scribe_days using gin (html gin_trgm_ops);
