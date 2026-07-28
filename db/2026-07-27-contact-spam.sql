-- 迷惑メール・悪意コメントの隔離(2026-07-27)。
-- 判定は lib/site/spamFilter.ts(ルールベース)。消さずに隔離し、
-- 隔離分はメール通知を送らない=Andyの目に入らない。誤判定はstudioで救出できる。
alter table contact_messages
  add column if not exists spam boolean not null default false,
  add column if not exists spam_score integer,
  add column if not exists spam_reasons text[];

-- 受信箱(spam=false)の一覧が主経路なので、そこを引く索引
create index if not exists contact_messages_spam_created_idx
  on contact_messages (spam, created_at desc);
