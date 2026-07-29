-- EVENTS棚(2026-07-29)。Supabase SQL Editorで一度実行する。
--
-- 背景: 過去に開催した催しの告知・記録がInstagramにしか無く、サイトに置き場が
-- 無かった。articlesのtypeを一つ増やすだけで、studioでの執筆・Updates・
-- 「同じ頃」・sitemap・写真のPHOTOLOG流入まで既存の配管がそのまま乗る。
--
-- 開催日について: 催しは「記録した日」ではなく「開催した日」に属する。
-- eventだけはstudioでpublished_atを指定できるようにし(APIで型を限定)、
-- 棚の並び・「同じ頃」・パンくずすべてが実際の開催日で揃うようにしている。

alter table articles drop constraint if exists articles_type_check;
alter table articles add constraint articles_type_check
  check (type in ('article', 'photography', 'physical', 'event'));
