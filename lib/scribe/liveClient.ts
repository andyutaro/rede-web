// scribe中継(sub側)のクライアントエンジン。relay/scribe_watch.html からの移植。
// クライアントコンポーネント専用(DOM APIを使う)。
//
// - sanitizeNodes: 受信HTMLのホワイトリスト・サニタイズ。中継は認証済みscribeしか
//   pubできないが、万一書き込み口が破られた場合にこのサイトが攻撃の配布点になるのを
//   防ぐ保険。scribeが実際に生成するタグ(br/img/video/a/iframe/div)だけを許可し、
//   属性はこちらで組み立て直す。確定アーカイブの表示にも同じ関数を通す。
// - patchInto: data-block-idをキーにした差分適用。全量replaceだと打鍵のたびに
//   <video>やiframeがリセットされるため、変わっていないノードには一切触れない。
// - connectLive: /ws/sub への接続・presence/スナップショットの振り分け・再接続。

export const ALLOWED_IFRAME_HOSTS = [
  'open.spotify.com',
  'embed.podcasts.apple.com',
  'www.youtube.com',
]

export function sanitizeNodes(html: string): Node[] {
  // DOMParserの生成するドキュメントは不活性(スクリプト実行・リソース読込なし)
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return sanitizeChildren(doc.body)
}

// テキスト中の素のURLをリンク化する。deskのURLリンク化(2026-07-03)以前の
// アーカイブはURLがプレーンテキストのまま保存されているため、表示側で補う
// (確定アーカイブのデータ自体は書き換えない)。
const URL_RE = /https?:\/\/[^\s<>"'、。」』）】]+/g

function linkifyText(text: string): Node[] {
  const out: Node[] = []
  let last = 0
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0]
    if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)))
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.className = 'plain-link'
    a.textContent = url
    out.push(a)
    last = m.index + url.length
  }
  if (last < text.length) out.push(document.createTextNode(text.slice(last)))
  return out
}

// deskが焼き込むブロックIDは差分適用のキーとして引き継ぐ(値は形式検証する)
function copyBlockId(from: Element, to: Element) {
  const bid = from.getAttribute('data-block-id')
  if (bid && /^[A-Za-z0-9_-]{1,64}$/.test(bid)) to.setAttribute('data-block-id', bid)
}

// inLink: 祖先に<a>がある間はリンク化しない(アンカーの入れ子を作らない)
function sanitizeChildren(node: Node, inLink = false): Node[] {
  const out: Node[] = []
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ''
      if (inLink) {
        out.push(document.createTextNode(text))
      } else {
        out.push(...linkifyText(text))
      }
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const el = child as Element
    const tag = el.tagName

    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEMPLATE') continue // 中身ごと捨てる

    if (tag === 'BR') {
      out.push(document.createElement('br'))
      continue
    }
    if (tag === 'IMG') {
      const src = el.getAttribute('src') || ''
      if (/^(https?:\/\/|\/|images\/)/i.test(src)) {
        const img = document.createElement('img')
        img.src = src
        img.className = 'embed-image'
        copyBlockId(el, img)
        out.push(img)
      }
      continue
    }
    if (tag === 'VIDEO') {
      const src = el.getAttribute('src') || ''
      if (/^https:\/\//i.test(src)) {
        const v = document.createElement('video')
        v.src = src
        v.controls = true
        v.playsInline = true
        v.preload = 'metadata'
        v.className = 'embed-video'
        copyBlockId(el, v)
        out.push(v)
      }
      continue
    }
    if (tag === 'A') {
      const href = el.getAttribute('href') || ''
      if (/^(https?:|mailto:|\/|images\/)/i.test(href)) {
        const a = document.createElement('a')
        a.href = href
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        a.className = /\bembed-pdf\b/.test(el.className) ? 'embed-pdf' : 'plain-link'
        copyBlockId(el, a)
        a.append(...sanitizeChildren(el, true))
        out.push(a)
      } else {
        out.push(...sanitizeChildren(el, inLink)) // 不正なhrefはリンクを剥がして中身だけ
      }
      continue
    }
    if (tag === 'IFRAME') {
      const src = el.getAttribute('src') || ''
      try {
        const u = new URL(src)
        if (u.protocol === 'https:' && ALLOWED_IFRAME_HOSTS.includes(u.hostname)) {
          const f = document.createElement('iframe')
          f.src = u.href
          const h = parseInt(el.getAttribute('height') || '', 10)
          if (h > 0 && h <= 1000) f.height = String(h)
          f.setAttribute('allow', 'autoplay; encrypted-media; fullscreen; picture-in-picture')
          f.setAttribute('loading', 'lazy')
          copyBlockId(el, f)
          out.push(f)
        }
      } catch {
        // 不正なURLは捨てる
      }
      continue
    }
    if (tag === 'DIV') {
      const div = document.createElement('div')
      if (/\bembed-podcast\b/.test(el.className)) div.className = 'embed-podcast'
      copyBlockId(el, div)
      div.append(...sanitizeChildren(el, inLink))
      out.push(div)
      continue
    }
    // その他のタグ(ペースト由来のb/span等): タグを剥がして中身だけ残す
    out.push(...sanitizeChildren(el, inLink))
  }
  return out
}

// ---- 差分適用 ----
function nodeKey(node: Node): string | null {
  if (node.nodeType === Node.ELEMENT_NODE) {
    const id = (node as Element).getAttribute('data-block-id')
    if (id) return (node as Element).tagName + '#' + id
  }
  return null
}

function sameNode(a: Node, b: Node): boolean {
  if (a.nodeType !== b.nodeType) return false
  if (a.nodeType === Node.TEXT_NODE) return a.textContent === b.textContent
  if (a.nodeType === Node.ELEMENT_NODE)
    return (a as Element).outerHTML === (b as Element).outerHTML
  return false
}

// caretを渡すと適用後に末尾へ付け直す(ライブ表示用)。アーカイブ表示ではcaretなし。
export function patchInto(view: HTMLElement, newNodes: Node[], caret?: HTMLElement) {
  caret?.remove()
  let cur: ChildNode | null = view.firstChild
  for (const next of newNodes) {
    // 変わっていない -> 触らない
    if (cur && sameNode(cur, next)) {
      cur = cur.nextSibling
      continue
    }
    const key = nodeKey(next)
    if (key) {
      // 同じキーのノードが後方にあれば、間の古いノードを削除して追いつく
      // (ブロック削除時に後続の動画等を作り直さないため)
      let scan: ChildNode | null = cur
      while (scan && nodeKey(scan) !== key) scan = scan.nextSibling
      if (scan && cur) {
        while (cur !== scan) {
          const n: ChildNode | null = cur!.nextSibling
          cur!.remove()
          cur = n
        }
        if (cur && sameNode(cur, next)) {
          cur = cur.nextSibling
          continue
        }
        // 同じブロックの中身が変わった -> その場で置換
        if (cur) {
          const after: ChildNode | null = cur.nextSibling
          view.replaceChild(next, cur)
          cur = after
          continue
        }
      }
    }
    // 新規ノード -> 現在位置に挿入
    view.insertBefore(next, cur)
  }
  // 余った古いノードを削除
  while (cur) {
    const n: ChildNode | null = cur.nextSibling
    cur.remove()
    cur = n
  }
  if (caret) view.appendChild(caret)
}

export type Presence = 'live' | 'away'

export type LiveHandlers = {
  onPresence: (presence: Presence) => void
  // isReplay: 接続直後に中継が送ってくる最新スナップショットの再送(いま打鍵されたものではない)。
  // 中継プロセスが日を跨いで生きていた場合、前日の内容の可能性があるので、
  // 「当日未執筆(idle)」の判定側はreplayを内容表示の根拠にしないこと。
  onSnapshot: (html: string, meta: { isReplay: boolean }) => void
  onDisconnect?: () => void
}

// relayは https://... 形式(SCRIBE_RELAY_URL)。ws(s)に読み替えて/ws/subへ接続する。
// 戻り値は破棄関数(アンマウント時に呼ぶ)。切断時は2秒後に自動再接続。
export function connectLive(relay: string, handlers: LiveHandlers): () => void {
  let disposed = false
  let ws: WebSocket | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  // 書き手側のページリロードでseqが振り直されるため、sessionが変わったらリセットする
  let lastSession: string | null = null
  let lastSeq = 0

  const wsUrl = relay.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws/sub'

  function connect() {
    if (disposed) return
    ws = new WebSocket(wsUrl)
    let receivedInThisConnection = false

    ws.addEventListener('message', (e) => {
      let msg: { presence?: string; session?: string; seq?: number; html?: string }
      try {
        msg = JSON.parse(e.data)
      } catch {
        return
      }
      if (msg.presence) {
        handlers.onPresence(msg.presence === 'live' ? 'live' : 'away')
        return
      }
      if (typeof msg.html !== 'string' || typeof msg.seq !== 'number') return
      if (msg.session !== lastSession) {
        lastSession = msg.session ?? null
        lastSeq = 0
      }
      if (msg.seq <= lastSeq) return // 順序が入れ替わった古いスナップショットは捨てる
      lastSeq = msg.seq
      const isReplay = !receivedInThisConnection
      receivedInThisConnection = true
      handlers.onSnapshot(msg.html, { isReplay })
    })

    ws.addEventListener('close', () => {
      if (disposed) return
      handlers.onDisconnect?.()
      timer = setTimeout(connect, 2000)
    })
    ws.addEventListener('error', () => {
      try {
        ws?.close()
      } catch {
        // no-op
      }
    })
  }

  connect()

  return () => {
    disposed = true
    if (timer) clearTimeout(timer)
    try {
      ws?.close()
    } catch {
      // no-op
    }
  }
}
