// 波形から生えて流れていく小さな線画(2026-08-07 Andy承認)。
//
// 「誰かが来た」を数でも文字でも言わずに伝えるための背景表現。サイトが開かれる
// たびに一つだけ波形から生え、波形と同じ速度で流れ、一往復して消える。溜めない
// (誰もいない時間まで賑やかに見せない=Away表示を正直に出す作法と同じ)。
//
// 絵柄は番組由来の25種(Andyが50候補から10種を選び、2026-08-12に15種を増補)。すべて波形と同じ線幅・同じ色で
// 描き、上に貼られたステッカーではなく「線が一瞬その形になった」ように見せる。
// 座標系は寸法体系で統一: 原点=波形の線上、上が-y、1単位=SIZE px。
// 原点が線上にあるので、scale 0→1 の一様拡大がそのまま「生えてくる」動きになる。

type Ctx = CanvasRenderingContext2D

// 生きもの1体の状態。pは道のりの進み具合(0=生えたて、1=画面外)。
// 波形上の位置fは描画時にpから引く: 直線とスマホの円弧では模様の流れる向きが
// 逆なので、向きを状態として持たせると、途中で画面幅が変わった時に破綻する
// (円弧に切り替わった瞬間、直線用に生えた個体が一瞬で流れ去っていた)
// spawnedAt=生えた時刻(エポックms)。「今日来てくれた人」の二重計上避けに使う
export type Creature = { kind: number; p: number; born: number; size: number; spawnedAt: number }

export const MAX_ON_SCREEN = 5 // 同時に泳げる数の上限(2026-08-07 Andy指定)
const GROW_MS = 1100 // 波形から生え切るまで

// 線と絵が重ならないようにする(2026-08-07 Andy指摘)。線をまたぐと、
// 波形が絵を横切って読めなくなる。全部どちらか片側に寄せて、必ず隙間を空ける。
// 0.3→0.55→0.8: 二度の「近すぎる」指摘(2026-08-12、PC・スマホとも)を受けて段階的に
const GAP = 0.8

// --- 10種の線画。すべてctx.beginPath()済みの状態で呼ばれ、strokeは呼び出し側 ---

// 1. 魚(サカナカイギ)。線をまたいで泳ぐ
function fish(c: Ctx) {
  c.moveTo(-0.55, 0)
  c.quadraticCurveTo(0, -0.42, 0.62, 0)
  c.quadraticCurveTo(0, 0.42, -0.55, 0)
  c.moveTo(-0.55, 0)
  c.lineTo(-1.0, -0.32)
  c.quadraticCurveTo(-0.82, 0, -1.0, 0.32)
  c.lineTo(-0.55, 0)
  c.moveTo(0.36, -0.09)
  c.arc(0.32, -0.09, 0.045, 0, Math.PI * 2)
}

// 2. 芽(ミモリラジオ)。線が地面になる
function sprout(c: Ctx) {
  c.moveTo(0, 0)
  c.quadraticCurveTo(-0.05, -0.45, 0, -0.88)
  // 双葉。左右で高さを少しずらす(左右対称にすると記号くさくなる)
  c.moveTo(0, -0.44)
  c.quadraticCurveTo(-0.66, -0.52, -0.58, -0.98)
  c.quadraticCurveTo(-0.2, -0.8, 0, -0.44)
  c.moveTo(0, -0.6)
  c.quadraticCurveTo(0.66, -0.7, 0.56, -1.14)
  c.quadraticCurveTo(0.2, -0.94, 0, -0.6)
}

// 3. 水母。柔らかい輪郭は他の9つと被らない
function jelly(c: Ctx) {
  // 傘は縦長の砲弾形にする(きのこと同じ丸い傘だと小さい時に見分けがつかない)
  c.moveTo(-0.36, -0.62)
  c.bezierCurveTo(-0.4, -1.44, 0.4, -1.44, 0.36, -0.62)
  c.quadraticCurveTo(0.24, -0.5, 0.12, -0.62)
  c.quadraticCurveTo(0, -0.5, -0.12, -0.62)
  c.quadraticCurveTo(-0.24, -0.5, -0.36, -0.62)
  // 触手は長く後ろへ引く。水中を漂う姿はこの尾で決まる
  for (const [x, s] of [
    [-0.24, 1],
    [-0.08, -1],
    [0.08, 1],
    [0.24, -1],
  ] as const) {
    c.moveTo(x, -0.58)
    c.bezierCurveTo(x + 0.22 * s, -0.32, x - 0.22 * s, -0.06, x + 0.1 * s, 0.24)
  }
}

// 4. きのこ(ミモリラジオ)。丸い傘は他に無い形
function mushroom(c: Ctx) {
  // 傘は平たく幅広に(水母の縦長と対にして、小さい時も見分けがつくようにする)。軸は太く短く
  c.moveTo(-0.66, -0.46)
  c.quadraticCurveTo(-0.6, -0.92, 0, -0.92)
  c.quadraticCurveTo(0.6, -0.92, 0.66, -0.46)
  c.lineTo(-0.66, -0.46)
  c.moveTo(-0.21, -0.46)
  c.quadraticCurveTo(-0.26, -0.14, -0.17, 0)
  c.lineTo(0.17, 0)
  c.quadraticCurveTo(0.26, -0.14, 0.21, -0.46)
}

// 5. 貝(帆立)。蝶番を下に、波打つ縁を上に。単純な扇形で最小サイズに最も強い
function shell(c: Ctx) {
  c.moveTo(0, -0.04)
  c.lineTo(-0.62, -0.6)
  // 縁の波(4山)。ここが直線だと丘や傘に見える
  c.quadraticCurveTo(-0.47, -0.82, -0.31, -0.72)
  c.quadraticCurveTo(-0.16, -0.9, 0, -0.8)
  c.quadraticCurveTo(0.16, -0.9, 0.31, -0.72)
  c.quadraticCurveTo(0.47, -0.82, 0.62, -0.6)
  c.lineTo(0, -0.04)
  // 放射する筋
  for (const x of [-0.34, 0, 0.34]) {
    c.moveTo(0, -0.08)
    c.lineTo(x, -0.66)
  }
}

// 6. 鳥。唯一の「線の上を飛ぶ」枠(線が地平線になる)
// 翼をV字に立てる(なだらかにすると雲や丘に見える)
function bird(c: Ctx) {
  c.moveTo(-0.78, -0.3)
  c.quadraticCurveTo(-0.4, -0.36, -0.06, 0.06)
  c.quadraticCurveTo(0.28, -0.36, 0.66, -0.3)
}

// 7. 舟。線が水面になる。波に乗る絵そのもの
// 帆は立てない(⛵はAndyが弾いている)。櫂を1本だけ差す
function boat(c: Ctx) {
  c.moveTo(-0.62, -0.2)
  c.quadraticCurveTo(0, 0.34, 0.62, -0.2)
  c.lineTo(-0.62, -0.2)
  // 櫂。舟の外まで伸ばして水面に触れさせる
  c.moveTo(0.38, -0.66)
  c.lineTo(-0.2, -0.06)
  c.moveTo(0.38, -0.66)
  c.lineTo(0.52, -0.58)
}

// 8. 飛行機(ON-AIRDO)。線が雲海・地平線になる
// 真上から見た形。胴体は線ではなく細い紡錘にして、矢印に見えないようにする
function plane(c: Ctx) {
  c.moveTo(0.82, 0)
  c.quadraticCurveTo(0.1, -0.1, -0.72, -0.07)
  c.quadraticCurveTo(-0.82, 0, -0.72, 0.07)
  c.quadraticCurveTo(0.1, 0.1, 0.82, 0)
  // 主翼(後退角は浅め。深く引くと矢羽根になる)
  c.moveTo(0.14, -0.07)
  c.lineTo(-0.2, -0.6)
  c.lineTo(-0.04, -0.6)
  c.lineTo(0.28, -0.06)
  c.moveTo(0.14, 0.07)
  c.lineTo(-0.2, 0.6)
  c.lineTo(-0.04, 0.6)
  c.lineTo(0.28, 0.06)
  // 尾翼
  c.moveTo(-0.5, -0.06)
  c.lineTo(-0.68, -0.3)
  c.lineTo(-0.58, -0.3)
  c.lineTo(-0.42, -0.05)
  c.moveTo(-0.5, 0.06)
  c.lineTo(-0.68, 0.3)
  c.lineTo(-0.58, 0.3)
  c.lineTo(-0.42, 0.05)
}

// 9. 烏賊(女川の実題材)。長い胴とヒレは魚とも水母とも違う
function squid(c: Ctx) {
  c.moveTo(0, -1.05)
  c.quadraticCurveTo(0.3, -0.72, 0.26, -0.28)
  c.lineTo(-0.26, -0.28)
  c.quadraticCurveTo(-0.3, -0.72, 0, -1.05)
  c.moveTo(-0.02, -1.02)
  c.lineTo(-0.28, -0.86)
  c.moveTo(0.02, -1.02)
  c.lineTo(0.28, -0.86)
  for (const x of [-0.18, -0.06, 0.06, 0.18]) {
    c.moveTo(x, -0.28)
    c.quadraticCurveTo(x + 0.1, -0.14, x - 0.04, 0.04)
  }
}

// 10. 泡。他が全部「一匹」なので、群れとして流れる粒を一つ
function bubbles(c: Ctx) {
  c.moveTo(-0.14, -0.34)
  c.arc(-0.3, -0.34, 0.26, 0, Math.PI * 2)
  c.moveTo(0.34, -0.72)
  c.arc(0.18, -0.72, 0.16, 0, Math.PI * 2)
  c.moveTo(0.44, -0.2)
  c.arc(0.34, -0.2, 0.1, 0, Math.PI * 2)
}

// --- 増補15種(2026-08-12 Andy承認)。森と北海道を厚くし、動きの種類を増やす ---

// 11. かに(女川)。既存に無い「関節のある形」。左右対称なので進行方向を持たない
function crab(c: Ctx) {
  c.moveTo(-0.52, -0.34)
  c.quadraticCurveTo(0, -0.64, 0.52, -0.34)
  c.quadraticCurveTo(0, -0.06, -0.52, -0.34)
  c.moveTo(-0.2, -0.5)
  c.lineTo(-0.2, -0.66)
  c.moveTo(0.2, -0.5)
  c.lineTo(0.2, -0.66)
  // 鋏。先を割って「はさみ」だと分かるようにする
  for (const s of [-1, 1]) {
    c.moveTo(0.5 * s, -0.4)
    c.quadraticCurveTo(0.84 * s, -0.5, 0.8 * s, -0.76)
    c.lineTo(0.92 * s, -0.62)
  }
  // 脚は片側3本。下へ広げて甲羅を持ち上げる
  for (const s of [-1, 1]) {
    for (const [x0, x1, y1] of [
      [0.3, 0.62, 0.04],
      [0.44, 0.76, -0.08],
      [0.5, 0.82, -0.22],
    ] as const) {
      c.moveTo(x0 * s, -0.28)
      c.lineTo(x1 * s, y1)
    }
  }
}

// 12. いるか。唯一の「跳ねる」枠。線のすぐ上に置くと水面から出た姿になる
function dolphin(c: Ctx) {
  c.moveTo(-0.86, 0.28)
  c.bezierCurveTo(-0.4, -0.46, 0.36, -0.6, 0.9, -0.22)
  c.bezierCurveTo(0.4, -0.08, -0.1, 0.08, -0.62, 0.44)
  c.lineTo(-0.86, 0.28)
  // 尾びれ(上下に割る)
  c.moveTo(-0.86, 0.28)
  c.lineTo(-1.08, 0.1)
  c.moveTo(-0.62, 0.44)
  c.lineTo(-1.0, 0.5)
  // 背びれ。これが無いと魚に見える
  c.moveTo(-0.02, -0.52)
  c.lineTo(-0.18, -0.86)
  c.lineTo(0.24, -0.58)
  // 口
  c.moveTo(0.9, -0.22)
  c.lineTo(0.62, -0.16)
}

// 13. もみの木(北海道)。縦の三角。芽・きのこと背丈で対になる
function conifer(c: Ctx) {
  c.moveTo(0, 0)
  c.lineTo(0, -0.26)
  c.moveTo(-0.46, -0.24)
  c.lineTo(0, -0.58)
  c.lineTo(0.46, -0.24)
  c.moveTo(-0.36, -0.52)
  c.lineTo(0, -0.86)
  c.lineTo(0.36, -0.52)
  c.moveTo(-0.24, -0.8)
  c.lineTo(0, -1.14)
  c.lineTo(0.24, -0.8)
}

// 14. ふぐ。丸+棘。同じ「魚」でも輪郭が全く別物になる
function puffer(c: Ctx) {
  c.moveTo(0.44, 0)
  c.arc(0, 0, 0.44, 0, Math.PI * 2)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.25
    c.moveTo(Math.cos(a) * 0.44, Math.sin(a) * 0.44)
    c.lineTo(Math.cos(a) * 0.64, Math.sin(a) * 0.64)
  }
  c.moveTo(-0.42, -0.14)
  c.lineTo(-0.78, -0.32)
  c.lineTo(-0.72, 0.04)
  c.lineTo(-0.42, 0.14)
  c.moveTo(0.29, -0.14)
  c.arc(0.24, -0.14, 0.05, 0, Math.PI * 2)
}

// 15. はね。全種で最も軽い。落ちてくる動きは他と被らない
function feather(c: Ctx) {
  c.moveTo(0.5, -0.86)
  c.bezierCurveTo(0.08, -0.58, -0.2, -0.18, -0.42, 0.3)
  c.bezierCurveTo(-0.04, -0.04, 0.28, -0.3, 0.5, -0.86)
  c.moveTo(0.5, -0.86)
  c.lineTo(-0.54, 0.42)
  // 先の割れ(羽らしさはここで出る)
  c.moveTo(-0.08, -0.16)
  c.lineTo(-0.26, -0.02)
  c.moveTo(0.1, -0.4)
  c.lineTo(-0.08, -0.26)
}

// 16. かも。線の上に浮かぶ(舟と同じ枠の、生きているもの版)
function duck(c: Ctx) {
  c.moveTo(-0.62, -0.16)
  c.quadraticCurveTo(-0.52, -0.56, 0.02, -0.5)
  c.quadraticCurveTo(0.5, -0.45, 0.44, -0.12)
  c.quadraticCurveTo(0, 0.06, -0.62, -0.16)
  c.moveTo(0.26, -0.47)
  c.quadraticCurveTo(0.3, -0.82, 0.56, -0.84)
  c.quadraticCurveTo(0.78, -0.86, 0.76, -0.66)
  c.quadraticCurveTo(0.74, -0.5, 0.5, -0.44)
  c.moveTo(0.76, -0.72)
  c.lineTo(1.0, -0.67)
  c.lineTo(0.74, -0.6)
  c.moveTo(-0.62, -0.16)
  c.lineTo(-0.88, -0.34)
  c.moveTo(0.69, -0.74)
  c.arc(0.655, -0.74, 0.035, 0, Math.PI * 2)
}

// 17. どんぐり。最小のシルエット。寸法に変化がつく
function acorn(c: Ctx) {
  c.moveTo(-0.3, -0.42)
  c.bezierCurveTo(-0.34, 0.06, 0.34, 0.06, 0.3, -0.42)
  c.moveTo(-0.36, -0.42)
  c.quadraticCurveTo(0, -0.28, 0.36, -0.42)
  c.quadraticCurveTo(0.3, -0.68, 0, -0.68)
  c.quadraticCurveTo(-0.3, -0.68, -0.36, -0.42)
  c.moveTo(0, -0.68)
  c.lineTo(0.05, -0.86)
}

// 18. かめ。甲羅のドーム+ひれ。ゆっくり泳ぐ形が空いていた
function turtle(c: Ctx) {
  c.moveTo(-0.56, -0.1)
  c.quadraticCurveTo(-0.5, -0.64, 0, -0.64)
  c.quadraticCurveTo(0.5, -0.64, 0.56, -0.1)
  c.lineTo(-0.56, -0.1)
  c.moveTo(-0.2, -0.12)
  c.lineTo(-0.16, -0.54)
  c.moveTo(0.2, -0.12)
  c.lineTo(0.16, -0.54)
  c.moveTo(0.56, -0.24)
  c.quadraticCurveTo(0.86, -0.3, 0.88, -0.12)
  c.quadraticCurveTo(0.88, 0, 0.66, -0.04)
  c.moveTo(0.34, -0.1)
  c.quadraticCurveTo(0.52, 0.22, 0.22, 0.26)
  c.moveTo(-0.34, -0.1)
  c.quadraticCurveTo(-0.58, 0.16, -0.8, 0.04)
}

// 19. ふくろう(森の夜)。丸い頭に耳の突起。鳥とは別の輪郭になる
function owl(c: Ctx) {
  c.moveTo(-0.44, -0.5)
  c.quadraticCurveTo(-0.5, -1.0, 0, -1.0)
  c.quadraticCurveTo(0.5, -1.0, 0.44, -0.5)
  c.quadraticCurveTo(0.4, -0.06, 0, -0.06)
  c.quadraticCurveTo(-0.4, -0.06, -0.44, -0.5)
  c.moveTo(-0.36, -0.86)
  c.lineTo(-0.46, -1.14)
  c.lineTo(-0.18, -0.98)
  c.moveTo(0.36, -0.86)
  c.lineTo(0.46, -1.14)
  c.lineTo(0.18, -0.98)
  c.moveTo(-0.09, -0.74)
  c.arc(-0.18, -0.74, 0.09, 0, Math.PI * 2)
  c.moveTo(0.27, -0.74)
  c.arc(0.18, -0.74, 0.09, 0, Math.PI * 2)
  c.moveTo(0, -0.68)
  c.lineTo(-0.07, -0.56)
  c.lineTo(0.07, -0.56)
  c.lineTo(0, -0.68)
}

// 20. くじら。潮の縦線があるので魚と読み違えない
function whale(c: Ctx) {
  c.moveTo(-0.86, -0.18)
  c.bezierCurveTo(-0.5, -0.68, 0.5, -0.7, 0.92, -0.26)
  c.bezierCurveTo(0.6, 0.12, -0.3, 0.2, -0.86, -0.18)
  c.moveTo(-0.86, -0.18)
  c.lineTo(-1.18, -0.46)
  c.quadraticCurveTo(-1.0, -0.16, -1.16, 0.12)
  c.lineTo(-0.86, -0.18)
  // 潮
  c.moveTo(0.42, -0.64)
  c.quadraticCurveTo(0.32, -0.94, 0.16, -1.06)
  c.moveTo(0.42, -0.64)
  c.quadraticCurveTo(0.52, -0.94, 0.64, -1.06)
  c.moveTo(0.73, -0.3)
  c.arc(0.69, -0.3, 0.04, 0, Math.PI * 2)
  c.moveTo(0.92, -0.26)
  c.quadraticCurveTo(0.72, -0.12, 0.5, -0.1)
}

// 21. えび(女川)。丸まった胴と長い触角。小さいと烏賊に近づくので触角で離す
function shrimp(c: Ctx) {
  c.moveTo(0.62, -0.28)
  c.bezierCurveTo(0.2, -0.82, -0.5, -0.68, -0.6, -0.16)
  c.bezierCurveTo(-0.3, -0.34, 0.2, -0.36, 0.62, -0.28)
  for (const [x, y, x2, y2] of [
    [0.3, -0.54, 0.24, -0.34],
    [0.05, -0.64, -0.01, -0.42],
    [-0.22, -0.6, -0.26, -0.4],
  ] as const) {
    c.moveTo(x, y)
    c.lineTo(x2, y2)
  }
  c.moveTo(-0.6, -0.16)
  c.lineTo(-0.92, -0.04)
  c.moveTo(-0.6, -0.16)
  c.lineTo(-0.84, -0.36)
  c.moveTo(0.62, -0.28)
  c.quadraticCurveTo(0.92, -0.5, 1.04, -0.88)
  c.moveTo(0.62, -0.28)
  c.quadraticCurveTo(0.98, -0.28, 1.12, -0.5)
  c.moveTo(0.59, -0.38)
  c.arc(0.55, -0.38, 0.04, 0, Math.PI * 2)
}

// 22. マイク。はっきり「ポッドキャスト」と言う唯一の一つ。線から生えて立つ
function mic(c: Ctx) {
  c.moveTo(-0.26, -0.62)
  c.quadraticCurveTo(-0.26, -1.04, 0, -1.04)
  c.quadraticCurveTo(0.26, -1.04, 0.26, -0.62)
  c.quadraticCurveTo(0.26, -0.44, 0, -0.44)
  c.quadraticCurveTo(-0.26, -0.44, -0.26, -0.62)
  c.moveTo(-0.24, -0.74)
  c.lineTo(0.24, -0.74)
  c.moveTo(-0.24, -0.88)
  c.lineTo(0.24, -0.88)
  c.moveTo(0, -0.44)
  c.lineTo(0, -0.14)
  c.moveTo(-0.3, -0.02)
  c.quadraticCurveTo(0, -0.22, 0.3, -0.02)
}

// 23. 花。丸い花弁。芽と同じ植物枠だが、輪郭は円の集合で別物になる
function flower(c: Ctx) {
  const cy = -0.72
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI * 2
    const px = Math.cos(a) * 0.32
    const py = cy + Math.sin(a) * 0.32
    c.moveTo(px + 0.2, py)
    c.arc(px, py, 0.2, 0, Math.PI * 2)
  }
  c.moveTo(0.09, cy)
  c.arc(0, cy, 0.09, 0, Math.PI * 2)
  c.moveTo(0, cy + 0.34)
  c.lineTo(0, 0)
  c.moveTo(0, -0.22)
  c.quadraticCurveTo(0.32, -0.32, 0.36, -0.06)
}

// 24. あざらし(北海道)。丸い塊なので、ひげと前びれで亀・くじらから離す
function seal(c: Ctx) {
  c.moveTo(-0.9, -0.2)
  c.bezierCurveTo(-0.6, -0.52, -0.1, -0.5, 0.28, -0.66)
  c.quadraticCurveTo(0.6, -0.82, 0.78, -0.56)
  c.quadraticCurveTo(0.9, -0.36, 0.62, -0.3)
  c.bezierCurveTo(0.2, -0.16, -0.4, -0.02, -0.9, -0.2)
  c.moveTo(-0.9, -0.2)
  c.lineTo(-1.16, -0.42)
  c.moveTo(-0.9, -0.2)
  c.lineTo(-1.1, 0.02)
  c.moveTo(0.1, -0.3)
  c.quadraticCurveTo(0.02, 0.08, -0.28, 0.08)
  c.moveTo(0.61, -0.6)
  c.arc(0.575, -0.6, 0.035, 0, Math.PI * 2)
  c.moveTo(0.78, -0.46)
  c.lineTo(0.98, -0.42)
}

// 25. 雷(2026-08-12 Andy追加)。角ばった形は全種の中で完全に独立している
function bolt(c: Ctx) {
  c.moveTo(0.24, -1.12)
  c.lineTo(-0.34, -0.42)
  c.lineTo(0.02, -0.42)
  c.lineTo(-0.26, 0.06)
  c.lineTo(0.36, -0.6)
  c.lineTo(0.0, -0.6)
  c.closePath()
}

// 順序はAndyの優先順位ランキング(1位=魚)。sizeは寸法体系の中での相対倍率
const SHAPES: ((c: Ctx) => void)[] = [
  fish,
  sprout,
  jelly,
  mushroom,
  shell,
  bird,
  boat,
  plane,
  squid,
  bubbles,
  // 増補15種(2026-08-12)
  crab,
  dolphin,
  conifer,
  puffer,
  feather,
  duck,
  acorn,
  turtle,
  owl,
  whale,
  shrimp,
  mic,
  flower,
  seal,
  bolt,
]
const SIZE_MUL = [
  1.15, 0.95, 1.0, 0.9, 0.85, 0.9, 0.95, 1.05, 1.0, 0.85,
  // どんぐりは最小、くじらは最大。寸法に幅を持たせて並びを単調にしない
  0.95, 1.1, 0.95, 0.9, 0.9, 0.95, 0.72, 0.95, 0.85, 1.15, 1.0, 0.85, 0.8, 1.05, 0.85,
]

// 各絵の縦の広がり[上端, 下端](ローカル単位、上が負)。線から逃がす量の計算に使う
const EXT: [number, number][] = [
  [-0.32, 0.32], // 魚
  [-1.14, 0], // 芽
  [-1.24, 0.24], // 水母
  [-0.92, 0], // きのこ
  [-0.86, -0.04], // 貝
  [-0.33, 0.06], // 鳥
  [-0.66, 0.07], // 舟
  [-0.6, 0.6], // 飛行機
  [-1.05, 0.04], // 烏賊
  [-0.88, -0.08], // 泡
  [-0.78, 0.06], // かに
  [-0.86, 0.5], // いるか
  [-1.14, 0], // もみの木
  [-0.64, 0.64], // ふぐ
  [-0.86, 0.42], // はね
  [-0.86, 0.06], // かも
  [-0.86, 0.06], // どんぐり
  [-0.64, 0.28], // かめ
  [-1.14, -0.04], // ふくろう
  [-1.06, 0.2], // くじら
  [-0.88, -0.04], // えび
  [-1.04, -0.02], // マイク
  [-1.24, 0], // 花
  [-0.82, 0.08], // あざらし
  [-1.12, 0.06], // 雷
]

// 線を水面・地面と見立てて上下に振り分ける(2026-08-07 Andy指定)。
// 生えるもの・浮かぶもの・飛ぶものは線の上、水の生きものは線の下。
// 偏りは問題にしない(上6・下4)
const ABOVE = [
  false, true, false, true, true, true, true, true, false, false,
  // かに/ふぐ/かめ/くじら/えび/あざらしは水の中、いるかは跳ねるので水面の上
  false, true, true, false, true, true, true, false, true, false, false, true, true, false, true,
]

// 空を行くものは線からさらに離す(地平線の上を飛んでいる高さを出す)
const EXTRA = [
  0.15, 0, 0.2, 0, 0, 0.55, 0, 0.75, 0.25, 0.1,
  // いるかは水面すぐ上(離しすぎると跳ねて見えない)。はねと雷は空の高み
  0.1, 0.3, 0, 0.2, 0.6, 0, 0, 0.15, 0.1, 0.25, 0.15, 0, 0, 0.2, 0.7,
]

export const KINDS = SHAPES.length

// kindを指定すると同じ絵で生える(到着の合図が種類を運ぶので、送り手と受け手の
// 画面に同じ生きものが現れる)。省略時はランダム。
// 基準サイズ15→17→20: 二度の「小さすぎる」指摘(2026-08-12、PC・スマホとも)を受けて段階的に
export function newCreature(now: number, kind?: number): Creature {
  const k = kind != null && Number.isInteger(kind) && kind >= 0 && kind < KINDS
    ? kind
    : Math.floor(Math.random() * KINDS)
  // 生え出す位置を少しだけ散らす(同時に来ると重なって一匹に見えるため)
  return { kind: k, p: Math.random() * 0.2, born: now, size: 20 * SIZE_MUL[k], spawnedAt: Date.now() }
}

// 進み具合pを波形上の位置fへ。直線は右から左、円弧はボタンから離れる向きへ流れる
export function creatureF(cr: Creature, arc: boolean): number {
  return arc ? 0.02 + cr.p : 0.98 - cr.p
}

// 一覧表示用(「今日来てくれた人」)。線も上下の振り分けも持たず、
// 絵そのものを箱の中央に置く。strokeStyle等は呼び出し側で設定しておく
export function paintShapeCentered(
  ctx: Ctx,
  kind: number,
  cx: number,
  cy: number,
  size: number
) {
  const [top, bottom] = EXT[kind]
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(size, size)
  ctx.translate(0, -(top + bottom) / 2)
  ctx.beginPath()
  SHAPES[kind](ctx)
  ctx.restore()
  ctx.stroke()
}

// 波形上の一点(px, py)と、その点での接線T・外向き法線Nを与えて1体描く。
// ローカル系: x=接線方向、-y=法線方向(=線から生える向き)
export function paintCreature(
  ctx: Ctx,
  cr: Creature,
  now: number,
  px: number,
  py: number,
  tx: number,
  ty: number,
  nx: number,
  ny: number
) {
  const age = now - cr.born
  // 生え際は速く、終わりはゆっくり(easeOut)。線から立ち上がる感じを出す
  const g = age >= GROW_MS ? 1 : 1 - Math.pow(1 - age / GROW_MS, 3)
  if (g <= 0.001) return
  const s = cr.size * g
  ctx.save()
  // 列ベクトル: x軸=T(進行方向)、y軸=-N(ローカルの上が線から離れる向き)
  ctx.transform(tx, ty, -nx, -ny, px, py)
  ctx.scale(s, s)
  // 線と重ならない位置へ寄せる。上に置くなら絵の下端を、下に置くなら上端を、
  // 線からGAPだけ離す。拡大と一緒に効くので、線から生えて離れていく動きになる
  const [top, bottom] = EXT[cr.kind]
  const extra = EXTRA[cr.kind]
  ctx.translate(0, ABOVE[cr.kind] ? -GAP - bottom - extra : GAP - top + extra)
  ctx.beginPath()
  SHAPES[cr.kind](ctx)
  // 変換を戻してからstrokeする。パスは既に画面座標で確定しているので形はそのまま、
  // 線幅だけが拡大の影響を受けない=どの大きさでも波形と同じ太さの線になる
  ctx.restore()
  ctx.stroke()
}
