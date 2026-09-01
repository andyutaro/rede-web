import { firstImageSrc } from '@/lib/site/text'

// サムネイルの「本文の最初の画像」への追従を、表示側から書き込み側へ移すための規則
// (2026-09-01)。以前は棚のページが毎回、全行の本文HTMLを取り寄せて導出し直していた
// (/notesだけで1回6.6MB=8月のEgress 2.95GB/5GBの主因)。答えは同じなので、
// 本文が変わった瞬間に一度だけ決めて列に置く。
//
// 優先順位は棚の表示と同じ: manual > 本文の最初の画像 > 充当(assigned)。
// - manual … 手で選んだものなので絶対に触らない
// - 本文に画像がある … first_imageとして焼き込む(後から写真が入ったら昇格する。
//   2026-06-22に踏んだ「充当のまま固まる」問題の担保はここで果たす)
// - 本文から画像が消えた … first_imageだった時だけ空に戻す。空にすれば棚が充当を
//   選び直す。assignedを消さないのは「一度決まったら固定」の原則を守るため
export type ThumbPatch = { thumbnail_url: string | null; thumbnail_source: string | null }

export function firstImageThumbPatch(
  html: string | null | undefined,
  current: { thumbnail_url?: string | null; thumbnail_source?: string | null }
): ThumbPatch | null {
  if (current.thumbnail_source === 'manual') return null
  const first = firstImageSrc(html ?? '')
  if (first) {
    if (current.thumbnail_url === first && current.thumbnail_source === 'first_image') return null
    return { thumbnail_url: first, thumbnail_source: 'first_image' }
  }
  if (current.thumbnail_source === 'first_image') {
    return { thumbnail_url: null, thumbnail_source: null }
  }
  return null
}
