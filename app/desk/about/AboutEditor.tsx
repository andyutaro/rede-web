'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { AboutContent } from '@/lib/site/about'
import './about-editor.css'

// テキスト⇔配列の変換。記法は導入しない(空行=段落区切り、改行=1項目は素の慣習)。
const splitPara = (s: string) =>
  s
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+$/, '').replace(/^\s+/, ''))
    .filter(Boolean)
const splitLines = (s: string) =>
  s
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean)
// 行頭に空白(全角スペース含む)があればサブ項目として扱う
const parseItems = (s: string) =>
  s
    .split(/\n/)
    .filter((l) => l.trim())
    .map((l) => ({ text: l.trim(), sub: /^[\s　]/.test(l) }))

type ShowDraft = { slug: string; name: string; blurb: string; role?: string }

export default function AboutEditor({ initial }: { initial: AboutContent }) {
  const [name, setName] = useState(initial.name)
  const [lead, setLead] = useState(initial.lead)
  const [intro, setIntro] = useState(initial.intro.join('\n\n'))
  const [coda, setCoda] = useState(initial.coda.join('\n'))
  const [profile, setProfile] = useState(initial.profile.join('\n\n'))
  const [ovNameLine, setOvNameLine] = useState(initial.overview.nameLine)
  const [ovNameNote, setOvNameNote] = useState(initial.overview.nameNote)
  const [ovBase, setOvBase] = useState(initial.overview.base)
  const [ovMail, setOvMail] = useState(initial.overview.mail)
  const [activities, setActivities] = useState(
    initial.overview.activities.map((a) => ({
      head: a.head,
      items: a.items.map((it) => (it.sub ? '　' : '') + it.text).join('\n'),
    }))
  )
  const [original, setOriginal] = useState<ShowDraft[]>(initial.original.map((s) => ({ ...s })))
  const [branded, setBranded] = useState<ShowDraft[]>(initial.branded.map((s) => ({ ...s })))
  const [stance, setStance] = useState(initial.stance.join('\n'))

  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)

  function build(): AboutContent {
    return {
      name,
      lead,
      intro: splitPara(intro),
      coda: splitLines(coda),
      profile: splitPara(profile),
      overview: {
        nameLine: ovNameLine,
        nameNote: ovNameNote,
        base: ovBase,
        mail: ovMail,
        activities: activities.map((a) => ({ head: a.head, items: parseItems(a.items) })),
      },
      original: original.map((s) => ({ slug: s.slug, name: s.name, blurb: s.blurb })),
      branded: branded.map((s) => ({
        slug: s.slug,
        name: s.name,
        blurb: s.blurb,
        role: s.role || undefined,
      })),
      stance: splitLines(stance),
    }
  }

  async function save() {
    setSaving(true)
    setStatus('保存中…')
    try {
      const res = await fetch('/api/about/save', {
        method: 'POST',
        body: JSON.stringify(build()),
      })
      if (res.ok) {
        setStatus('保存しました。/about に反映されます。')
      } else {
        const j = await res.json().catch(() => ({}))
        setStatus(`保存に失敗: ${j.error ?? res.status}`)
      }
    } catch {
      setStatus('保存に失敗しました（通信エラー）')
    } finally {
      setSaving(false)
    }
  }

  function updateShow(
    list: ShowDraft[],
    setList: (v: ShowDraft[]) => void,
    i: number,
    patch: Partial<ShowDraft>
  ) {
    setList(list.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  }

  return (
    <div className="ae-page">
    <div className="ae">
      <header className="ae-top">
        <h1>About を編集</h1>
        <div className="ae-actions">
          <Link href="/about" target="_blank" className="ae-preview">
            /about を開く ↗
          </Link>
          <button type="button" onClick={save} disabled={saving} className="ae-save">
            保存
          </button>
        </div>
      </header>
      {status && <div className="ae-status">{status}</div>}

      <Field label="署名（名前）">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="リード（役割の一文）">
        <textarea rows={2} value={lead} onChange={(e) => setLead(e.target.value)} />
      </Field>
      <Field label="本文（空行で段落を区切る）">
        <textarea rows={10} value={intro} onChange={(e) => setIntro(e.target.value)} />
      </Field>
      <Field label="帰結（コーダ・1行ずつ）">
        <textarea rows={3} value={coda} onChange={(e) => setCoda(e.target.value)} />
      </Field>

      <h2>PROFILE</h2>
      <Field label="プロフィール本文（空行で段落を区切る）">
        <textarea rows={10} value={profile} onChange={(e) => setProfile(e.target.value)} />
      </Field>

      <h2>OVERVIEW</h2>
      <div className="ae-row">
        <Field label="名前">
          <input value={ovNameLine} onChange={(e) => setOvNameLine(e.target.value)} />
        </Field>
        <Field label="名前の注記">
          <input value={ovNameNote} onChange={(e) => setOvNameNote(e.target.value)} />
        </Field>
      </div>
      <div className="ae-row">
        <Field label="拠点">
          <input value={ovBase} onChange={(e) => setOvBase(e.target.value)} />
        </Field>
        <Field label="Mail">
          <input value={ovMail} onChange={(e) => setOvMail(e.target.value)} />
        </Field>
      </div>
      <div className="ae-hint">
        活動リスト: 各行が1項目。行頭にスペースを入れるとサブ項目（字下げ）になります。
      </div>
      {activities.map((a, i) => (
        <div className="ae-act" key={i}>
          <Field label={`活動グループ ${i + 1} の見出し`}>
            <input
              value={a.head}
              onChange={(e) =>
                setActivities(activities.map((x, j) => (j === i ? { ...x, head: e.target.value } : x)))
              }
            />
          </Field>
          <Field label="項目（1行ずつ / 行頭スペースでサブ）">
            <textarea
              rows={5}
              value={a.items}
              onChange={(e) =>
                setActivities(
                  activities.map((x, j) => (j === i ? { ...x, items: e.target.value } : x))
                )
              }
            />
          </Field>
        </div>
      ))}

      <h2>ORIGINAL PODCASTS</h2>
      {original.map((s, i) => (
        <ShowFields
          key={s.slug}
          show={s}
          onName={(v) => updateShow(original, setOriginal, i, { name: v })}
          onBlurb={(v) => updateShow(original, setOriginal, i, { blurb: v })}
        />
      ))}

      <h2>BRANDED PODCASTS</h2>
      {branded.map((s, i) => (
        <ShowFields
          key={s.slug}
          show={s}
          withRole
          onName={(v) => updateShow(branded, setBranded, i, { name: v })}
          onBlurb={(v) => updateShow(branded, setBranded, i, { blurb: v })}
          onRole={(v) => updateShow(branded, setBranded, i, { role: v })}
        />
      ))}

      <h2>STANCE</h2>
      <Field label="信条（1行ずつ）">
        <textarea rows={9} value={stance} onChange={(e) => setStance(e.target.value)} />
      </Field>

      <div className="ae-foot">
        <button type="button" onClick={save} disabled={saving} className="ae-save">
          保存
        </button>
      </div>
    </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="ae-field">
      <span className="ae-label">{label}</span>
      {children}
    </label>
  )
}

function ShowFields({
  show,
  withRole,
  onName,
  onBlurb,
  onRole,
}: {
  show: ShowDraft
  withRole?: boolean
  onName: (v: string) => void
  onBlurb: (v: string) => void
  onRole?: (v: string) => void
}) {
  return (
    <div className="ae-show">
      <div className="ae-slug">{show.slug}</div>
      <Field label="番組名">
        <input value={show.name} onChange={(e) => onName(e.target.value)} />
      </Field>
      <Field label="紹介文">
        <textarea rows={4} value={show.blurb} onChange={(e) => onBlurb(e.target.value)} />
      </Field>
      {withRole && (
        <Field label="担当">
          <textarea rows={2} value={show.role ?? ''} onChange={(e) => onRole?.(e.target.value)} />
        </Field>
      )}
    </div>
  )
}
