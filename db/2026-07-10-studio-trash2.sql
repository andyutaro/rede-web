-- studioゴミ箱の拡張(2026-07-10後半)。Supabase SQL Editorで一度実行する。

-- scribe_days: 確定済みscribeもゴミ箱へ入れられるように(2段階削除はarticlesと同方式)。
-- trash=deleted_atを立てる(公開側の一覧・個別・検索・Updates・ページャーから消える)。
-- purge=ゴミ箱内のみ物理削除可。画像は翌0:01のGCが回収する。
alter table scribe_days add column if not exists deleted_at timestamptz;

-- episode_tags: Podcast Inboxの「ゴミ箱」。エピソード本体はRSSが真実で消せないため、
-- hidden=trueでInboxから見えなくする(戻すのはいつでも可能。物理削除は概念ごと無い)
alter table episode_tags add column if not exists hidden boolean not null default false;
