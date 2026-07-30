-- 公開読み取りポリシーからゴミ箱を除外する(2026-07-30 セキュリティ点検)。
--
-- 問題: articlesの公開ポリシーが status='published' だけを見ていて deleted_at を
-- 見ていなかった。公開済みの記事をstudioでゴミ箱に入れると、サイト上は消えるのに
-- 公開anonキー(クライアントに載る公開値)経由では本文が読めたままになる。
-- 点検時点ではゴミ箱0件のため露出は無かったが、1件入れた瞬間に実害が出る。
--
-- 対策: ポリシーに deleted_at is null を足す。公開側のコードは元から
-- deleted_at を除外しているので、表示は1ピクセルも変わらない。

alter table articles enable row level security;

drop policy if exists "public read published" on articles;
create policy "public read published" on articles
  for select using (status = 'published' and deleted_at is null);
