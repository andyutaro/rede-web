import { notFound } from 'next/navigation'
import {
  getContactContent,
  getMembershipContent,
  getPrivacyContent,
  type ContactContent,
  type MembershipContent,
  type PrivacyContent,
} from '@/lib/site/pages'
import { serializeField } from '@/lib/site/pageText'
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
