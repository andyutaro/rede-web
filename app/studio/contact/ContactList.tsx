'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { dateDots } from '@/lib/site/text'

export type ContactRow = {
  id: string
  name: string
  email: string
  topics: string[]
  message: string
  createdAt: string
  read: boolean
  deleted: boolean
  spam: boolean
  spamReasons: string[]
}

// SPAMタブ(2026-07-27): 自動隔離した分。消さずにここに残り、
// 「スパムではない」で受信箱へ戻せる(判定は必ず間違えるので救出路を必ず持つ)
type Filter = 'unread' | 'all' | 'spam' | 'trash'
// 種別(2026-08-01 Andy「お問合せとおたよりがごっちゃなUIに見える」)。
// おたよりフォームはtopicsを「おたより — 宛先」の形で送る(OtayoriForm)ので、
// データを足さずに1件ずつ判別できる。仕事の相談はそれ以外
type Kind = 'all' | 'client' | 'otayori'
const isOtayori = (r: ContactRow) => r.topics.some((t) => t.startsWith('おたより'))

// 返信の宛先を開くURL(2026-08-07 Andy報告の修正)。
// mailto:を使わない理由: macOSはmailto:をChromeに渡す設定になっており、
// そのChromeにGmailがハンドラ登録されていないと、押しても何も起きずに終わる
// (リンクは正しく生成されていたが受け皿が無かった)。OS・ブラウザの設定に
// 依存しないよう、Gmailの作成画面を直接開く。studioはAndy専用の部屋なので
// 送信元をGmailに決め打ちしてよい。
function replyHref(r: ContactRow): string {
  const subject = isOtayori(r)
    ? `Re: おたよりありがとうございます（${r.name}さん）`
    : `Re: お問い合わせの件（${r.name}さん）`
  const q = new URLSearchParams({ view: 'cm', fs: '1', to: r.email, su: subject })
  return `https://mail.google.com/mail/?${q.toString()}`
}

// 問い合わせ受信箱v2(2026-07-17): 列を整列した表形式(日付/状態/名前/メール/用件/本文冒頭)。
// 行クリックで本文展開(展開と同時に既読)。検索+行単位クイック操作(既読⇄未読/ゴミ箱)
// +チェックボックス一括操作(既読/未読/ゴミ箱/復元/完全消去)。
export default function ContactList({ rows }: { rows: ContactRow[] }) {
  const router = useRouter()
  // 既定は全件(2026-08-01 Andy「開いた時にメール全件が見れない」)。
  // 未読を既定にしていたため、全部読み終わっていると開いた瞬間は空に見えていた
  const [filter, setFilter] = useState<Filter>('all')
  const [kind, setKind] = useState<Kind>('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (kind !== 'all' && (kind === 'otayori') !== isOtayori(r)) return false
      if (filter === 'trash') {
        if (!r.deleted) return false
      } else if (filter === 'spam') {
        if (r.deleted || !r.spam) return false
      } else {
        // 受信箱(未読/全件)には隔離分を出さない=目に入らない
        if (r.deleted || r.spam) return false
        if (filter === 'unread' && r.read) return false
      }
      if (!needle) return true
      return (
        r.name.toLowerCase().includes(needle) ||
        r.email.toLowerCase().includes(needle) ||
        r.message.toLowerCase().includes(needle) ||
        r.topics.some((t) => t.toLowerCase().includes(needle))
      )
    })
  }, [rows, filter, kind, q])

  // 状態タブの件数は種別の絞り込みを反映する(絞った状態で数が合わないと迷う)
  const inKind = (r: ContactRow) => kind === 'all' || (kind === 'otayori') === isOtayori(r)
  const unreadCount = rows.filter((r) => inKind(r) && !r.deleted && !r.spam && !r.read).length
  const allCount = rows.filter((r) => inKind(r) && !r.deleted && !r.spam).length
  const spamCount = rows.filter((r) => inKind(r) && !r.deleted && r.spam).length
  const trashCount = rows.filter((r) => inKind(r) && r.deleted).length
  // 種別タブの件数は受信箱(ゴミ箱・隔離を除く)の中で数える
  const inbox = rows.filter((r) => !r.deleted && !r.spam)
  const otayoriCount = inbox.filter(isOtayori).length
  const clientCount = inbox.length - otayoriCount

  async function act(
    action: 'read' | 'unread' | 'trash' | 'restore' | 'purge' | 'spam' | 'notspam',
    ids: string[]
  ) {
    if (ids.length === 0 || busy) return
    if (action === 'purge') {
      if (!window.confirm(`選択した${ids.length}件を完全に消去します。よろしいですか？`)) return
    }
    setBusy(true)
    setMessage('')
    try {
      const res = await fetch('/api/contact/manage', {
        method: 'POST',
        body: JSON.stringify({ ids, action }),
      })
      if (!res.ok) throw new Error()
      setSelected(new Set())
      router.refresh()
    } catch {
      setMessage('操作に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  function toggleOpen(r: ContactRow) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(r.id)) next.delete(r.id)
      else next.add(r.id)
      return next
    })
    if (!r.read && !r.deleted) act('read', [r.id]) // 開いたら既読
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <>
      {/* 種別(2026-08-01): 仕事の相談と番組へのおたよりは性質が別物なので、
          まずここで分けられるようにする。既定は両方 */}
      <div className="inbox-filter inbox-filter-kind">
        {(
          [
            ['all', `すべて(${inbox.length})`],
            ['client', `問い合わせ(${clientCount})`],
            ['otayori', `おたより(${otayoriCount})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={kind === k ? 'active' : ''}
            onClick={() => {
              setKind(k)
              setSelected(new Set())
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="inbox-filter">
        {(
          [
            ['unread', `未読(${unreadCount})`],
            ['all', `全件(${allCount})`],
            ['spam', `SPAM(${spamCount})`],
            ['trash', `ゴミ箱(${trashCount})`],
          ] as const
        ).map(([f, label]) => (
          <button
            key={f}
            type="button"
            className={filter === f ? 'active' : ''}
            onClick={() => {
              setFilter(f)
              setSelected(new Set())
            }}
          >
            {label}
          </button>
        ))}
        <input
          type="search"
          className="toolbar-search"
          placeholder="名前・メール・本文を検索"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="問い合わせを検索"
        />
      </div>

      {shown.length > 0 && (
        <div className="studio-bulkbar">
          <label className="bulk-all">
            <input
              type="checkbox"
              checked={selected.size === shown.length && shown.length > 0}
              onChange={() =>
                setSelected((prev) =>
                  prev.size === shown.length ? new Set() : new Set(shown.map((r) => r.id))
                )
              }
              aria-label="全選択"
            />
            <span>{selected.size > 0 ? `${selected.size}件選択中` : '全選択'}</span>
          </label>
          {filter === 'trash' ? (
            <>
              <button type="button" className="bulk-btn" disabled={selected.size === 0 || busy} onClick={() => act('restore', [...selected])}>
                選択を元に戻す
              </button>
              <button type="button" className="bulk-btn bulk-danger" disabled={selected.size === 0 || busy} onClick={() => act('purge', [...selected])}>
                選択を完全に消去
              </button>
            </>
          ) : filter === 'spam' ? (
            <>
              <button type="button" className="bulk-btn" disabled={selected.size === 0 || busy} onClick={() => act('notspam', [...selected])}>
                選択はスパムではない
              </button>
              <button type="button" className="bulk-btn" disabled={selected.size === 0 || busy} onClick={() => act('trash', [...selected])}>
                選択をゴミ箱へ
              </button>
            </>
          ) : (
            <>
              <button type="button" className="bulk-btn" disabled={selected.size === 0 || busy} onClick={() => act(filter === 'unread' ? 'read' : 'unread', [...selected])}>
                {filter === 'unread' ? '選択を既読に' : '選択を未読に'}
              </button>
              <button type="button" className="bulk-btn" disabled={selected.size === 0 || busy} onClick={() => act('trash', [...selected])}>
                選択をゴミ箱へ
              </button>
            </>
          )}
          <span className="bulk-message">{message}</span>
        </div>
      )}

      {/* ヘッダー行(列の意味を固定幅で示す。contact-row-headの列幅と揃える) */}
      {shown.length > 0 && (
        <div className="contact-row contact-head-row" aria-hidden="true">
          <span className="row-check" />
          <span className="row-date">日付</span>
          <span className="contact-state">状態</span>
          <span className="contact-kind">種別</span>
          <span className="contact-name">名前</span>
          <span className="contact-email">メール</span>
          <span className="contact-excerpt">用件 / 本文</span>
          <span className="contact-actions" />
        </div>
      )}

      <div>
        {shown.map((r) => (
          <div className={`contact-row${r.read ? '' : ' unread'}`} key={r.id}>
            <div className="contact-row-head">
              <input
                type="checkbox"
                className="row-check"
                checked={selected.has(r.id)}
                onChange={() => toggleSelect(r.id)}
                aria-label={`${r.name} を選択`}
              />
              <span className="row-date">{dateDots(r.createdAt.slice(0, 10))}</span>
              <span className="contact-state">
                {r.deleted ? 'ゴミ箱' : r.spam ? '隔離' : r.read ? '既読' : <span className="contact-unread-dot">未読</span>}
              </span>
              {/* 種別は行の左側に固定で出す。一覧を眺めた時に仕事の相談だけを
                  拾えるよう、そちらを明るく、おたよりは落ち着いた緑にする */}
              <span className={`contact-kind${isOtayori(r) ? ' kind-otayori' : ' kind-client'}`}>
                {isOtayori(r) ? 'おたより' : '問い合わせ'}
              </span>
              <button type="button" className="contact-row-title" onClick={() => toggleOpen(r)}>
                <span className="contact-name">{r.name}</span>
                <span className="contact-email">{r.email}</span>
                <span className="contact-excerpt">
                  {r.topics.length > 0 && <span className="contact-topics">{r.topics.join(' / ')}</span>}
                  <span className="contact-preview">{r.message}</span>
                </span>
              </button>
              <span className="contact-actions">
                {r.deleted ? (
                  <button type="button" className="row-act" disabled={busy} onClick={() => act('restore', [r.id])}>
                    戻す
                  </button>
                ) : r.spam ? (
                  <>
                    <button type="button" className="row-act" disabled={busy} onClick={() => act('notspam', [r.id])}>
                      スパムではない
                    </button>
                    <button type="button" className="row-act" disabled={busy} onClick={() => act('trash', [r.id])}>
                      ゴミ箱へ
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="row-act"
                      disabled={busy}
                      onClick={() => act(r.read ? 'unread' : 'read', [r.id])}
                    >
                      {r.read ? '未読に' : '既読に'}
                    </button>
                    <button type="button" className="row-act" disabled={busy} onClick={() => act('spam', [r.id])}>
                      スパムへ
                    </button>
                    <button type="button" className="row-act" disabled={busy} onClick={() => act('trash', [r.id])}>
                      ゴミ箱へ
                    </button>
                  </>
                )}
              </span>
            </div>
            {open.has(r.id) && (
              <div className="contact-body">
                {/* なぜ隔離したかを必ず見せる(判定を監査できる箱にする) */}
                {r.spam && r.spamReasons.length > 0 && (
                  <p className="contact-spam-why">隔離の理由: {r.spamReasons.join(' / ')}</p>
                )}
                <p>{r.message}</p>
                {/* おたよりはメール任意(公開フォームの仕様)。空のまま返信ボタンを
                    出すとhref="mailto:"になり、押しても何も起きなかった
                    (2026-08-07 Andy報告)。宛先が無い時はボタンを出さず理由を書く */}
                {r.email ? (
                  <a
                    className="contact-reply"
                    href={replyHref(r)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    メールで返信 →
                  </a>
                ) : (
                  <p className="contact-reply-none">
                    メールアドレスの記入なし（おたよりは任意）。返信の宛先がありません。
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
        {shown.length === 0 && (
          <p className="studio-empty">
            {q
              ? '条件に合う問い合わせがありません'
              : filter === 'trash'
                ? 'ゴミ箱は空です'
                : filter === 'spam'
                  ? '隔離された迷惑メールはありません'
                  : filter === 'unread'
                    ? '未読はありません'
                    : '問い合わせはまだありません'}
          </p>
        )}
      </div>
    </>
  )
}
