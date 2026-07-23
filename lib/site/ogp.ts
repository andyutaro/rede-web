import type { Metadata } from 'next'
import { imgThumb, IMG_W } from '@/lib/site/img'

// SNSカードの画像指定(2026-07-23)。エピソードページで先に入れた形を
// Notes/Photography/Physical/scribeへ広げるための共通化。
// 画像はSupabase Storageの安定URL(Anchorのように失効しない)なので
// エッジ変換したURLをそのまま焼き込む。
// カードの縦横比は元画像次第なので、確実に大きく出したいときのみlargeを使う。
export function ogpImage(
  title: string,
  image: string | null | undefined,
  { large = false }: { large?: boolean } = {}
): Metadata {
  if (!image) return { title }
  const url = imgThumb(image, IMG_W.og)
  // 相対パスや非https(想定外)は載せない。カードは画像なしで成立する
  if (!/^https:\/\//i.test(url)) return { title }
  return {
    title,
    openGraph: { title, images: [{ url, alt: title }] },
    twitter: { card: large ? 'summary_large_image' : 'summary', images: [{ url, alt: title }] },
  }
}
