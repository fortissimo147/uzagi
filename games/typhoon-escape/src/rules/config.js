// DESIGN.md §1b.3 の換算表。**数値はここにしか書かない。**
//
// 元ゲーム（400x700 px のメルカトル平面）の定数を、換算定数 A で球面の「角度（度）」へ
// 移したもの。A の導出は §1b.2、再現は `npm run calibrate`。
// この表を書き換えると test/config.test.mjs の無次元比検査が落ちる。それが狙い。

/** 元ゲームの生の定数。**事実**なので変更しない。 */
export const ORIG = {
  W: 400,
  H: 700,
  M: 700,
  LONW: 110,
  PHI_J: 37, // 元ゲームが日本を置いた緯度
  K: 1.6, // 元ゲームが日本にかけていた拡大率
  RHO_JP: 9.622556981, // 日本(110m 全島・閉じ点を除く 62 頂点)の真の外接角半径[度] — tools/calibrate.mjs の実測
  LETHAL: 0.55, // 致死半径 / 外側半径
};

/**
 * 致死半径の倍率（本作の選択）。**元ゲームの半分**。
 *
 * 元は外側の 0.55 倍。本作は 0.275 倍にした（ユーザー指定）。
 * これは §1b.1 の「比を保存する」方針からの**意図的な逸脱**である。
 * 面積で見ると当たる的が 1/4 になるので、元より明確に易しい。§1b.7
 */
export const LETHAL_SCALE = 0.5;

/** 本作の設計選択。 */
export const RHO_TW = 1.857748022; // 台湾本島(10m・閉じ点を除く 403 頂点)の真の外接角半径[度] — 実測
export const K_TW = 1.0; // 描画倍率。実寸。難度には影響しない（§1b.2 の注意書き）

/** 元 px → 球面の度（弧長）。 */
const MJ = ORIG.W / ORIG.LONW / Math.cos((ORIG.PHI_J * Math.PI) / 180);
export const BODY_PX = ORIG.RHO_JP * MJ * ORIG.K; // 元での自国の描画外接半径[px]
export const BODY_DEG = RHO_TW * K_TW; // 球面での自国の描画外接角半径[度]
export const A = BODY_DEG / BODY_PX; // 度 / 元px

const px = (v) => v * A;

/** 換算後の全定数。単位はすべて「度」および「度/秒」。1 実秒 = ゲーム内 1 日。 */
export const CFG = {
  A,
  BODY_DEG,

  // --- 時間と暦（§1.2。元のまま） ---
  DT_MAX: 0.05,
  START_DATE: [2026, 7, 1], // new Date(2026, 7, 1) = 2026-08-01
  SLOWMO: 0.3,
  SLOWMO_MS: 1500,

  // --- 台風の強度（§1.5） ---
  R_INIT: px(ORIG.M * 0.015),
  R_PEAK_MIN: px(ORIG.M * 0.05),
  R_PEAK_RAND: px(ORIG.M * 0.035),
  R_DIE: px(ORIG.M * 0.012),
  LETHAL: ORIG.LETHAL * LETHAL_SCALE,
  GROW_T_MIN: 3,
  GROW_T_RAND: 3,
  DECAY_RATE: 0.12, // rPeak あたり毎秒
  DECAY_CHANCE: 0.06, // 毎秒
  LIFE_MIN: 12,
  LIFE_RAND: 10,
  LIFE_FORCE_DECAY: 5,

  // --- 速度（§1.6） ---
  PLAYER_SPD: px(ORIG.M * 0.125),
  STORM_SPD0: px(ORIG.M * 0.09),
  STORM_ACC: px(ORIG.M * 0.0035),
  STALL_FACTOR: 0.15,

  // --- スポーンと消滅（§1.6 / §1b.4） ---
  SPAWN_INTERVAL0: 4,
  SPAWN_INTERVAL_DECAY: 0.08,
  SPAWN_INTERVAL_MIN: 1.5,
  MAX_STORMS: 7,
  SPAWN_MARGIN: px(60),
  DESPAWN_MARGIN: px(150),
  SPAWN_ANGLE_JITTER: 0.8,

  // --- 押しのけ（§1.8） ---
  PUSH_SPD: px(ORIG.M * 0.125),
  PUSH_MARGIN: px(120),
  SLIDE_DAMP: 0.12, // ^dt
  SLIDE_CUTOFF: px(0.5),

  // --- 渦の見た目（§4.3） ---
  SPIN: (2 * Math.PI) / 6, // 6 秒で 1 回転[rad/s]。北半球は反時計回り、南半球は時計回り
  ARMS: 5, // 渦の腕の本数
  SPIRAL_B: 0.26, // 対数螺旋 r = a·e^(bθ) の巻きの強さ
  EYE: 0.13, // 眼の半径 / 外側半径

  // --- カメラ（§5.2） ---
  PLAY_W: px(ORIG.W),
  PLAY_H: px(ORIG.H),
  /** プレイ窓の縦横比（元ゲームの 400:700）。カメラはこの比の窓を必ず収める。 */
  WINDOW_ASPECT: ORIG.W / ORIG.H,
  /**
   * 画角の拡大率（本作の選択）。1.0 で元ゲームと同じ窓。
   * スマホの縦長画面では元の窓でも見える範囲が狭く感じるため 1.3 にした。§5.2b
   * 難度そのもの（速度・半径・発生間隔）には影響しない。
   * 台風の発生・消滅の距離は画角に追随するので、湧いて出る見え方も変わらない。
   */
  VIEW_SCALE: 1.3,
  get CAM_PLAY() {
    return (this.PLAY_H / 2) * this.VIEW_SCALE;
  },
  get CAM_FLOOR() {
    return this.CAM_PLAY / 2;
  },
  CAM_WORLD: 90,
  CAM_SMOOTH: 4, // 1 - exp(-k dt)
};

/** 進路パターン 5 種（§1.4）。元の数値そのまま。bias は発生時に決める。 */
export const PATTERNS = [
  { id: "STRAIGHT", segMin: 4, segMax: 7, jitter: 0.3, pull: 0.2, spd: 1.2, stall: 0 },
  { id: "ERRATIC", segMin: 0.7, segMax: 1.6, jitter: 2.4, pull: 0.2, spd: 0.9, stall: 0 },
  { id: "RECURVING", segMin: 1.5, segMax: 3, jitter: 0.3, pull: 0.2, spd: 1.0, stall: 0, biasRand: true },
  { id: "TRACKING", segMin: 1.5, segMax: 3, jitter: 0.6, pull: 0.9, spd: 0.8, stall: 0 },
  { id: "STALLING", segMin: 1.5, segMax: 3, jitter: 1.0, pull: 0.4, spd: 1.3, stall: 0.5 },
];

/** 元ゲームの配色（§1.9）。 */
export const COLORS = {
  ocean: "#1B2F5E",
  space: "#0E1A36",
  player: "#8FBF7F",
  playerLine: "#FFFFFF",
  land: "#4E6656",
  landLine: "#7C9A86",
  stormOuter: "#FFE000",
  stormInner: "#E61E2D",
  forecast: "rgba(240,70,80,0.7)",
};

/** 台湾本島の球面重心。開始位置に使う（元は px(144), py(37) から開始）。 */
export const START_LATLON = { lat: 23.761585, lon: 120.904893 };
