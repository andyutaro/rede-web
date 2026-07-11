-- Photography棚の下位区分(2026-07-11 Andy指定): artwork / photolog。
-- NotesのARTICLE/SCRIBEと同様に、PhotographyをALL/ARTWORK/PHOTOLOGで分ける。
-- あわせて写真の小さなdescription(個別ページでタイトル下に控えめに表示)。
-- Supabase SQL Editorで一度実行する。
alter table articles
  add column if not exists photo_kind text check (photo_kind in ('artwork', 'photolog')),
  add column if not exists description text not null default '';
