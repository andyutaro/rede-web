// アーカイブ確定が0:01 JSTである(SKILL.md)ため、「今日」は常に日本時間で判定する。
// デプロイ先サーバーのタイムゾーンに依存させない。
export function todayInTokyo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date())
}
