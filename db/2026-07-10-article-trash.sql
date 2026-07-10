-- 記事のゴミ箱(2026-07-10)。Supabase SQL Editorで一度実行する。
-- ゴミ箱入り = deleted_at を立てる + status を draft に落とす
-- (公開側は既存の status='published' 絞り込みだけで自動的に隠れる)。
-- 完全消去はゴミ箱内(deleted_at not null)のものだけAPIが受け付ける。
alter table articles add column if not exists deleted_at timestamptz;
