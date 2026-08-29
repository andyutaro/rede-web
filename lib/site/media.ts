// メディアの置き場所(2026-08-29)。写真・動画・音源はCloudflare R2へ移し、
// media.andyutaro.com から配る。Supabase Storageの1GB無料枠が動画17本で
// 83%埋まっていたため(実測435MB)。R2は10GBで、しかも下り転送が無料=
// 聴かれるほど枠が減る構造にならない。
//
// **URLの形に依存して書かないこと。** 移行で分かったのは、URL全体で
// 突き合わせている箇所が壊れるということ:
//  ・cronの孤児掃除 … 「本文にこのURLが含まれるか」で判定していたため、
//    移行直後は参照中の217件が全て孤児=削除対象になる状態だった
//  ・写真プール … /scribe-media/ を含むかで絞っていたため、新URLを拾えなかった
// どちらもパス(YYYY-MM-DD/uuid.ext)は新旧で同一なので、パスで見れば両方に効く。
export const MEDIA_BASE = 'https://media.andyutaro.com/'

// 旧(Supabase Storage)と新(R2)の両方から、バケット内のパスを取り出す。
//   旧: https://<project>.supabase.co/storage/v1/object/public/scribe-media/<path>
//   新: https://media.andyutaro.com/<path>
export function mediaPathOf(url: string | null | undefined): string | null {
  if (!url) return null
  const m = url.match(/(?:\/scribe-media\/|media\.andyutaro\.com\/)([^"'\s)<>?#]+)/)
  return m ? m[1] : null
}

// パスから配信URLを作る。新規はR2側を正とする
export function mediaUrl(path: string): string {
  return MEDIA_BASE + path
}

// アップロード日(パス構造「YYYY-MM-DD/uuid.ext」のフォルダ名)。新旧どちらのURLでも取れる
export function mediaUploadDate(url: string): string | null {
  const p = mediaPathOf(url)
  const m = p?.match(/^(\d{4}-\d{2}-\d{2})\//)
  return m ? m[1] : null
}
