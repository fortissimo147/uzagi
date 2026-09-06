import { check, near, section, summary } from "./harness.mjs";
import * as S from "../src/world/sphere.js";
import * as St from "../src/world/storm.js";
import { CFG, PATTERNS } from "../src/rules/config.js";

// 決定的な乱数。テストを再現可能にする。
function rng(seed = 1) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const TAIPEI = S.toVec(25.033, 121.5654);
const mk = (over = {}) =>
  St.createStorm({
    pos: S.toVec(20, 130),
    bearing: 0,
    pattern: PATTERNS[0],
    cfg: CFG,
    rand: rng(7),
    no: 1,
    name: "Wobbles",
    ...over,
  });

section("台風の生成（DESIGN.md §1.5）");
{
  const st = mk();
  near("初期半径 = R_INIT", st.r, CFG.R_INIT, 1e-12);
  check("ピーク半径が [R_PEAK_MIN, R_PEAK_MIN+R_PEAK_RAND] に入る",
    st.rPeak >= CFG.R_PEAK_MIN && st.rPeak <= CFG.R_PEAK_MIN + CFG.R_PEAK_RAND, `${st.rPeak}`);
  check("発達時間が 3–6 秒", st.growT >= 3 && st.growT <= 6, `${st.growT}`);
  check("寿命が 12–22 秒", st.life >= 12 && st.life <= 22, `${st.life}`);
  check("個体差 spd が pat.spd の 0.8–1.2 倍", st.spd >= PATTERNS[0].spd * 0.8 && st.spd <= PATTERNS[0].spd * 1.2, `${st.spd}`);
  near("接ベクトルが位置に直交", S.dot(st.p, st.t), 0, 1e-12);
  near("接ベクトルが単位長", Math.hypot(...st.t), 1, 1e-12);
}
{
  const st = St.createStorm({ pos: S.toVec(0, 0), bearing: 0, pattern: PATTERNS[2], cfg: CFG, rand: rng(3), no: 1, name: "x" });
  check("RECURVING は bias を持つ（0.5–1.0 の符号付き）",
    Math.abs(st.pat.bias) >= 0.5 && Math.abs(st.pat.bias) <= 1.0, `${st.pat.bias}`);
  const straight = mk();
  check("STRAIGHT は bias を持たない", straight.pat.bias === undefined);
}

section("成長・衰弱・寿命（§1.5）");
{
  const st = mk();
  const r0 = st.r;
  const tsp = CFG.STORM_SPD0;
  for (let i = 0; i < 10; i++) St.stepStorm(st, 0.1, TAIPEI, tsp, CFG, () => 0.99);
  check("最初は成長する", st.r > r0, `${r0} → ${st.r}`);
  // rPeak で頭打ちになること
  for (let i = 0; i < 200; i++) St.stepStorm(st, 0.05, TAIPEI, tsp, CFG, () => 0.99);
  check("rPeak を超えない", st.r <= st.rPeak + 1e-12, `${st.r} vs ${st.rPeak}`);
}
{
  // 衰弱が始まると縮む
  const st = mk();
  st.r = st.rPeak;
  st.decay = true;
  const r0 = st.r;
  St.stepStorm(st, 1, TAIPEI, CFG.STORM_SPD0, CFG, () => 0.99);
  near("衰弱率は rPeak の 12%/秒", r0 - st.r, st.rPeak * CFG.DECAY_RATE, 1e-12);
}
{
  // 残り 5 秒で強制衰弱
  const st = mk();
  st.r = st.rPeak;
  st.life = 4;
  const r0 = st.r;
  St.stepStorm(st, 0.5, TAIPEI, CFG.STORM_SPD0, CFG, () => 0.99);
  check("寿命残り 5 秒未満なら decay フラグなしでも縮む", st.r < r0);
}
{
  const st = mk();
  st.r = CFG.R_DIE + 1e-9;
  st.decay = true;
  const res = St.stepStorm(st, 1, TAIPEI, CFG.STORM_SPD0, CFG, () => 0.99);
  check("R_DIE を割ると weakened", res === "weakened", res);
}
{
  const st = mk();
  st.life = 0.1;
  const res = St.stepStorm(st, 1, TAIPEI, CFG.STORM_SPD0, CFG, () => 0.99);
  check("寿命が尽きると weakened", res === "weakened", res);
}

section("移動と旋回（§1.4 / §2.3）");
{
  const st = mk();
  const start = [...st.p];
  const tsp = CFG.STORM_SPD0;
  st.timer = 999; // 進路更新を起こさない
  St.stepStorm(st, 1, TAIPEI, tsp, CFG, () => 0.99);
  near("1 秒で tsp × spd 度だけ進む", S.angleDeg(start, st.p), tsp * st.spd, 1e-9);
  near("移動後も p·t = 0", S.dot(st.p, st.t), 0, 1e-12);
}
{
  const st = mk();
  st.stalled = true;
  st.timer = 999;
  const start = [...st.p];
  St.stepStorm(st, 1, TAIPEI, CFG.STORM_SPD0, CFG, () => 0.99);
  near("停滞中は 15% の速度", S.angleDeg(start, st.p), CFG.STORM_SPD0 * CFG.STALL_FACTOR, 1e-9);
}
{
  // pull=0.9 の TRACKING は、jitter を殺すと確実にプレイヤー方向へ寄る
  const st = St.createStorm({ pos: S.toVec(20, 130), bearing: Math.PI, pattern: PATTERNS[3], cfg: CFG, rand: rng(5), no: 1, name: "x" });
  const before = Math.abs(S.wrapAngle(S.bearing(st.p, TAIPEI) - St.bearingOf(st)));
  St.retarget(st, TAIPEI, CFG.STORM_SPD0, CFG, () => 0.5); // jitter 項が 0 になる
  const after = Math.abs(S.wrapAngle(S.bearing(st.p, TAIPEI) - St.bearingOf(st)));
  check("TRACKING(pull=0.9) は進路更新でプレイヤー方向へ 90% 寄る", after < before * 0.15, `${before.toFixed(4)} → ${after.toFixed(4)}`);
}
{
  const st = mk();
  const n0 = st.trail.length;
  St.retarget(st, TAIPEI, CFG.STORM_SPD0, CFG, rng(11));
  check("進路更新のたびに trail に節点が積まれる", st.trail.length === n0 + 1);
}
{
  // STALLING は stall 判定に当たると停滞へ入り、次の更新で必ず解除される
  const st = St.createStorm({ pos: S.toVec(20, 130), bearing: 0, pattern: PATTERNS[4], cfg: CFG, rand: rng(2), no: 1, name: "x" });
  St.retarget(st, TAIPEI, CFG.STORM_SPD0, CFG, () => 0.1); // 0.1 < stall 0.5
  check("STALLING は確率判定に当たると停滞に入る", st.stalled === true);
  check("停滞の timer は 1–2.5 秒", st.timer >= 1 && st.timer <= 2.5, `${st.timer}`);
  St.retarget(st, TAIPEI, CFG.STORM_SPD0, CFG, () => 0.1);
  check("停滞は次の更新で必ず解除される", st.stalled === false);
}

section("予報円（§1.7）— 予告が実際の挙動と一致すること");
{
  // 「timer 秒後にどこにいるか」を予報円が正しく言い当てているか。
  // ここがズレると、プレイヤーは嘘の情報で回避することになる。
  const st = mk();
  st.timer = 2.5;
  const tsp = CFG.STORM_SPD0;
  St.setForecast(st, tsp, CFG);
  const fc = { ...st.forecast, p: [...st.forecast.p] };
  // timer を消費しきる直前まで進める（更新が走らないよう寸止めする）
  const steps = 250;
  for (let i = 0; i < steps; i++) St.stepStorm(st, 2.5 / steps - 1e-9, TAIPEI, tsp, CFG, () => 0.99);
  near("予報位置に実際に到達する（誤差 1e-6 度未満）", S.angleDeg(fc.p, st.p), 0, 1e-6);
  near("予報距離 = 速度 × timer", fc.dist, tsp * st.spd * 2.5, 1e-9);
  near("予報半径 = その時点の致死半径", fc.r, St.lethalRadius(st, CFG), 1e-6);
}
{
  const st = mk();
  st.r = CFG.R_DIE / 2; // 消滅寸前
  st.decay = true;
  st.timer = 5;
  St.setForecast(st, CFG.STORM_SPD0, CFG);
  near("予報半径は R_DIE × 0.55 を下回らない", st.forecast.r, CFG.R_DIE * CFG.LETHAL, 1e-12);
}

section("視界外での消滅（§1b.4）");
{
  const visible = CFG.CAM_PLAY;
  const st = mk();
  st.p = [...S.toVec(25.033, 121.5654)];
  check("視界内に入ると entered が立つ", St.outOfPlay(st, TAIPEI, visible, CFG) === false && st.entered === true);
  // 遠ざける
  st.p = [...S.toVec(25.033 + visible + st.r + 1, 121.5654)];
  check("一度入った後に視界＋半径を超えたら消滅", St.outOfPlay(st, TAIPEI, visible, CFG) === true);
}
{
  const visible = CFG.CAM_PLAY;
  const st = mk();
  st.p = [...S.toVec(25.033 + visible + CFG.DESPAWN_MARGIN + 1, 121.5654)];
  check("一度も入らなくても強制消滅マージンを超えたら消滅", St.outOfPlay(st, TAIPEI, visible, CFG) === true);
  const st2 = mk();
  st2.p = [...S.toVec(25.033 + visible + 1, 121.5654)];
  check("視界のすぐ外は、未進入なら消えない（元の -150px 相当まで待つ）", St.outOfPlay(st2, TAIPEI, visible, CFG) === false);
}

section("極でも壊れないこと");
{
  const st = St.createStorm({ pos: S.toVec(89.5, 0), bearing: 0, pattern: PATTERNS[0], cfg: CFG, rand: rng(9), no: 1, name: "x" });
  const r = rng(13);
  for (let i = 0; i < 500; i++) St.stepStorm(st, 0.05, S.toVec(88, 90), CFG.STORM_SPD0, CFG, r);
  check("極を通っても NaN が出ない", st.p.every(Number.isFinite) && st.t.every(Number.isFinite), JSON.stringify(st.p));
  near("極通過後も |p| = 1", Math.hypot(...st.p), 1, 1e-9);
  near("極通過後も p·t = 0", S.dot(st.p, st.t), 0, 1e-9);
}

summary("storm");
