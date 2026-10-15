import { notFound } from 'next/navigation'
import {
  getContactContent,
  getMembershipContent,
  getPrivacyContent,
  type ContactContent,
  type MembershipContent,
  type PrivacyContent,
} from '@/lib/site/pages'
import { getDeskPreamble } from '@/lib/site/pages'
import { serializeField } from '@/lib/site/pageText'
import { getShow } from '@/lib/site/showContent'
import PageEditor, { type EditorField } from '../PageEditor'

export const dynamic = 'force-dynamic'

// 各固定ページの現在値を「フィールド(テキスト)」へ展開してエディタに渡す。
// privacyのsectionsは複数見出しがあるため、各セクションを heading/本文 の2フィールドに開く。
async function buildFields(key: string): Promise<{ title: string; fields: EditorField[] } | null> {
  if (key === 'contact') {
    const c: ContactContent = await getContactContent()
    return {
      title: 'CONTACT',
      fields: [
        { name: 'intro', label: '導入文', kind: 'paragraphs', value: serializeField('paragraphs', c.intro), rows: 4, hint: '空行で段落を分けます' },
        { name: 'condition', label: '※現在の調子(1行)', kind: 'text', value: serializeField('text', c.condition) },
        {
          name: 'qa',
          label: 'Q&A',
          kind: 'qa',
          value: serializeField('qa', c.qa),
          rows: 24,
          hint: '「---」の行でQ&Aを区切ります。各ブロックの1行目=質問、以降=回答(空行で段落)',
        },
      ],
    }
  }
  if (key === 'membership') {
    const m: MembershipContent = await getMembershipContent()
    return {
      title: 'MEMBERSHIP',
      fields: [
        { name: 'intro', label: '導入文', kind: 'text', value: serializeField('text', m.intro), rows: 3 },
        { name: 'benefits', label: '特典リスト(1行=1項目)', kind: 'lines', value: serializeField('lines', m.benefits), rows: 5 },
        { name: 'sub', label: 'チャットルームの内訳(1行=1項目)', kind: 'lines', value: serializeField('lines', m.sub), rows: 3 },
        { name: 'closing', label: '結び', kind: 'text', value: serializeField('text', m.closing), rows: 3 },
        { name: 'reasonLead', label: 'THE REASON リード(1行)', kind: 'text', value: serializeField('text', m.reasonLead) },
        { name: 'reason', label: 'THE REASON 本文', kind: 'paragraphs', value: serializeField('paragraphs', m.reason), rows: 16, hint: '空行で段落を分けます' },
        { name: 'note', label: '注記', kind: 'text', value: serializeField('text', m.note), rows: 3 },
      ],
    }
  }
  if (key === 'privacy') {
    const p: PrivacyContent = await getPrivacyContent()
    return {
      title: 'PRIVACY POLICY',
      fields: [
        { name: 'intro', label: '導入文', kind: 'text', value: serializeField('text', p.intro), rows: 3 },
        {
          name: 'sections',
          label: '各条項',
          kind: 'sections',
          value: serializeField('sections', p.sections),
          rows: 26,
          hint: '「---」の行で条項を区切ります。各ブロックの1行目=見出し、以降=本文(空行で段落)',
        },
      ],
    }
  }
  if (key === 'desk_preamble') {
    const d = await getDeskPreamble()
    return {
      title: 'DESK — 冒頭の位置づけ文',
      fields: [
        {
          name: 'lines',
          label: '本文',
          kind: 'segments',
          value: serializeField('segments', d.lines),
          rows: 4,
          hint: '1行＝1行。「|」で分節すると、狭い画面ではそこで折り返します',
        },
        { name: 'live', label: '締めの一行（今日の生放送）', kind: 'text', value: serializeField('text', d.live) },
        { name: 'archive', label: '締めの一行（過ぎた日のアーカイブ）', kind: 'text', value: serializeField('text', d.archive) },
      ],
    }
  }

  // 番組ページの言葉(2026-10-15 Andy指定)。
  // **構造はここに出さない**——slug・ORIGINAL/WORKSの群・フィードURL・取り込み開始日・
  // ヒーロー映像のパス・地図の緯度経度・派生記事のIDはコード(lib/site/shows.ts)のまま。
  // フォームから触れるようにすると壊れ方が静かなため(フィードURLを一字間違えれば
  // 番組が丸ごと消え、緯度経度はフォーム上で意味が読めない)。
  // **空欄にした項目は出なくなる**(コードの既定には戻らない)。
  if (key.startsWith('show:')) {
    const show = await getShow(key.slice('show:'.length))
    if (!show) return null
    const fields: EditorField[] = [
      { name: 'name', label: '番組名', kind: 'text', value: serializeField('text', show.name) },
      { name: 'shortName', label: '短縮名（「◯◯配信」で使う。空欄なら番組名）', kind: 'text', value: serializeField('text', show.shortName ?? '') },
      { name: 'display', label: 'タイル下の表記（SAKANAKAIGI等）', kind: 'text', value: serializeField('text', show.display ?? '') },
      // introは改行をそのまま出す(white-space: pre-line)ので、段落ではなく素のテキストで持つ
      { name: 'intro', label: '番組の言葉（識別部の紹介文）', kind: 'text', value: serializeField('text', show.intro ?? ''), rows: 6, hint: '改行はそのまま出ます。空欄にすると出なくなります' },
      { name: 'role', label: '担当（ROLE）', kind: 'text', value: serializeField('text', show.role ?? ''), rows: 3 },
      { name: 'cast', label: '出演者', kind: 'cast', value: serializeField('cast', show.cast ?? []), rows: 5, hint: '1行＝1人。「名前 | 担当 | URL」。URLは省略可' },
    ]
    if (show.place) {
      fields.push(
        { name: 'place.ja', label: '舞台（日本語）', kind: 'text', value: serializeField('text', show.place.ja) },
        { name: 'place.en', label: '舞台（英語）', kind: 'text', value: serializeField('text', show.place.en) },
        { name: 'place.note', label: '舞台の注記', kind: 'text', value: serializeField('text', show.place.note ?? '') }
      )
    }
    fields.push(
      { name: 'platforms.spotify', label: '配信先 Spotify のURL', kind: 'text', value: serializeField('text', show.platforms?.spotify ?? '') },
      { name: 'platforms.apple', label: '配信先 Apple Podcasts のURL', kind: 'text', value: serializeField('text', show.platforms?.apple ?? '') },
      { name: 'platforms.listen', label: '配信先 LISTEN のURL', kind: 'text', value: serializeField('text', show.platforms?.listen ?? '') },
      { name: 'otayoriTopics', label: 'おたよりの宛先項目（1行=1項目）', kind: 'lines', value: serializeField('lines', show.otayoriTopics ?? []), rows: 4 },
      { name: 'otayoriUrl', label: '外部おたよりフォームのURL', kind: 'text', value: serializeField('text', show.otayoriUrl ?? '') }
    )
    return { title: `PODCAST — ${show.display ?? show.name}`, fields }
  }

  return null
}

export default async function EditPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params
  const built = await buildFields(key)
  if (!built) notFound()

  return (
    <>
      <h1 className="studio-h1">{built.title}</h1>
      <PageEditor pageKey={key} fields={built.fields} />
    </>
  )
}
