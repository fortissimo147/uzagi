// 台風 1 個の状態と時間発展。DESIGN.md §1.4 / §1.5 / §1.7 の球面版。
// 純関数と素のオブジェクトだけ。three.js にも rules/ にも依存しない（§0.3）。
import * as S from "./sphere.js";

/**
 * 台風を作る。呼び出し側（rules/）が定数と乱数を渡す。
 * 半径・速度の単位はすべて「度（弧長）」。
 *
 * @param {object} o
 * @param {number[]} o.pos      発生位置（単位ベクトル）
 * @param {number}   o.bearing  初期進行方位（ラジアン、北0・東+）
 * @param {object}   o.pattern  PATTERNS の 1 つ
 * @param {object}   o.cfg      CFG
 * @param {() => number} o.rand 0..1 の乱数
 */
export function createStorm({ pos, bearing, pattern, cfg, rand, no, name }) {
  const pat = { ...pattern };
  if (pat.biasRand) pat.bias = (rand() < 0.5 ? 1 : -1) * (0.5 + rand() * 0.5);
  const p = [...pos];
  const t = S.tangentFromBearing(p, bearing);
  return {
    no,
    name,
    pat,
    p,
    t,
    r: cfg.R_INIT,
    rPeak: cfg.R_PEAK_MIN + rand() * cfg.R_PEAK_RAND,
    growT: cfg.GROW_T_MIN + rand() * cfg.GROW_T_RAND,
    decay: false,
    entered: false,
    life: cfg.LIFE_MIN + rand() * cfg.LIFE_RAND,
    spd: pat.spd * (0.8 + rand() * 0.4),
    stalled: false,
    rot: rand() * Math.PI * 2, // 渦の回転位相。個体ごとにばらす
    timer: pat.segMin + rand() * (pat.segMax - pat.segMin),
    trail: [[...p]],
    forecast: null,
  };
}

/** 現在の進行速度[度/秒]。元の `t.stalled ? tsp*0.15 : tsp*t.spd`。 */
export function speedOf(st, tsp, cfg) {
  return st.stalled ? tsp * cfg.STALL_FACTOR : tsp * st.spd;
}

/** 致死半径[度]。外側の 0.55 倍。見た目と判定はこの値で完全に一致させる。 */
export const lethalRadius = (st, cfg) => st.r * cfg.LETHAL;

/**
 * 予報円。元の setForecast() と同じ式を球面で解く（§1.7）。
 * 「次の進路更新までの timer 秒間、この向き・この速さで進む」という正直な予告。
 */
export function setForecast(st, tsp, cfg) {
  const v = speedOf(st, tsp, cfg);
  const T = st.timer;
  let r;
  if (st.decay || st.life - T <= cfg.LIFE_FORCE_DECAY) r = st.r - st.rPeak * cfg.DECAY_RATE * T;
  else r = Math.min(st.rPeak, st.r + (st.rPeak / st.growT) * T);

  const fp = [...st.p];
  const ft = [...st.t];
  S.advance(fp, ft, v * T * S.DEG);
  st.forecast = {
    p: fp,
    dist: v * T, // 度
    r: Math.max(cfg.R_DIE, r) * cfg.LETHAL,
  };
  return st.forecast;
}

/**
 * 進路の更新。timer が尽きたときだけ呼ぶ（毎フレームではない）。§1.4。
 * @param {number[]} target プレイヤー位置（単位ベクトル）
 */
export function retarget(st, target, tsp, cfg, rand) {
  const pat = st.pat;
  if (pat.stall > 0 && !st.stalled && rand() < pat.stall) {
    st.stalled = true;
    st.timer = 1 + rand() * 1.5;
  } else {
    st.stalled = false;
    st.timer = pat.segMin + rand() * (pat.segMax - pat.segMin);
    const want = S.bearing(st.p, target);
    const now = bearingOf(st);
    const d = S.wrapAngle(want - now);
    const next = now + d * pat.pull + (rand() - 0.5) * pat.jitter + (pat.bias || 0);
    st.t = S.tangentFromBearing(st.p, next);
  }
  st.trail.push([...st.p]);
  setForecast(st, tsp, cfg);
}

/** 現在の進行方位（ラジアン）。接ベクトルから読み出す。 */
export function bearingOf(st) {
  const { east, north } = S.tangentBasis(st.p);
  return Math.atan2(S.dot(st.t, east), S.dot(st.t, north));
}

/**
 * 1 フレーム進める。戻り値は "alive" | "weakened" | "gone"。
 * 元の update() の台風部分そのまま（§1.5）。
 */
export function stepStorm(st, dt, target, tsp, cfg, rand) {
  // 渦の回転。北半球は反時計回り、南半球は時計回り（実際の低気圧と同じ向き）。
  st.rot += (st.p[1] >= 0 ? 1 : -1) * cfg.SPIN * dt;
  st.timer -= dt;
  if (st.timer <= 0) retarget(st, target, tsp, cfg, rand);

  S.advance(st.p, st.t, speedOf(st, tsp, cfg) * dt * S.DEG);
  st.life -= dt;

  if (st.decay || st.life <= cfg.LIFE_FORCE_DECAY) {
    st.r -= st.rPeak * cfg.DECAY_RATE * dt;
  } else if (st.r < st.rPeak) {
    st.r = Math.min(st.rPeak, st.r + (st.rPeak / st.growT) * dt);
  } else if (rand() < dt * cfg.DECAY_CHANCE) {
    st.decay = true;
  }

  if (st.r <= cfg.R_DIE || st.life <= 0) return "weakened";
  return "alive";
}

/**
 * 画面外での消滅判定の球面版（§1b.4）。
 * 元は矩形との比較だったが、球面では**プレイヤーからの角距離**で測る。
 * @param {number} visible カメラの可視角半径[度]
 */
export function outOfPlay(st, target, visible, cfg) {
  const d = S.angleDeg(st.p, target);
  if (!st.entered && d < visible) {
    st.entered = true;
    return false;
  }
  if (st.entered && d > visible + st.r) return true;
  return d > visible + cfg.DESPAWN_MARGIN;
}
