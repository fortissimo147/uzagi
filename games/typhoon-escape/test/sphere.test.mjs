import { check, near, section, summary } from "./harness.mjs";
import * as S from "../src/world/sphere.js";

section("球面数学（DESIGN.md §2）");

// --- 2.1 往復 ---
let worst = 0;
for (const [lat, lon] of [[0, 0], [25.033, 121.5654], [-85.192, -157.13], [89.9, 12], [-89.9, -12], [45, 180], [45, -180]]) {
  const r = S.toLatLon(S.toVec(lat, lon));
  const dl = Math.abs(r.lat - lat);
  let dn = Math.abs(r.lon - lon);
  if (dn > 180) dn = 360 - dn; // ±180 は同じ点
  worst = Math.max(worst, dl, dn);
}
check("緯度経度の往復誤差 < 1e-9 度", worst < 1e-9, `最大 ${worst.toExponential(2)}`);

// --- 2.2 距離。座標は [推定]（記憶）だが、計算の一致を見るのが目的 ---
const d = (a, b) => S.degToKm(S.angleDeg(S.toVec(...a), S.toVec(...b)));
near("台北→高雄 296.8 km", d([25.033, 121.5654], [22.6273, 120.3014]), 296.8, 0.1);
near("台北→マニラ 1161.7 km", d([25.033, 121.5654], [14.5995, 120.9842]), 1161.7, 0.1);
near("台北→グアム 2751.5 km", d([25.033, 121.5654], [13.4443, 144.7937]), 2751.5, 0.1);
near("赤道 90 度 = 地球円周の 1/4", S.degToKm(90), (2 * Math.PI * S.R_KM) / 4, 0.001);

// --- 2.3 大圏移動 ---
section("大圏移動：正規直交性と緯度非依存");
{
  // 台北から真東へ 1000 km。緯度25度でも 1000 km 進むこと（緯度に足す方式なら狂う）。
  const p = S.toVec(25.033, 121.5654);
  const start = [...p];
  const t = S.tangentFromBearing(p, Math.PI / 2);
  S.advance(p, t, S.kmToDeg(1000) * S.DEG);
  near("東へ 1000 km 進むと角距離も 1000 km 相当", S.degToKm(S.angleDeg(start, p)), 1000, 0.001);
  near("|p| = 1 を保つ", Math.hypot(...p), 1, 1e-12);
  near("p·t = 0 を保つ", S.dot(p, t), 0, 1e-12);
}
{
  // 同じ操作を高緯度でやっても距離が変わらない
  const results = [];
  for (const lat of [0, 45, 80, 89]) {
    const p = S.toVec(lat, 0);
    const start = [...p];
    const t = S.tangentFromBearing(p, Math.PI / 2);
    S.advance(p, t, S.kmToDeg(500) * S.DEG);
    results.push(S.degToKm(S.angleDeg(start, p)));
  }
  const spread = Math.max(...results) - Math.min(...results);
  check("緯度 0/45/80/89 で東へ 500 km 進んだ距離が一致（緯度非依存）", spread < 1e-6, `ばらつき ${spread.toExponential(2)} km`);
}
{
  // 極を跨いで進む。破綻しないこと。
  const p = S.toVec(80, 0);
  const t = S.tangentFromBearing(p, 0); // 真北
  S.advance(p, t, 20 * S.DEG); // 北極を 10 度越える
  const r = S.toLatLon(p);
  near("北へ 20 度進むと緯度 80 → 80（極を越えて反対側の経度へ）", r.lat, 80, 1e-9);
  near("経度が 180 度反転する", Math.abs(r.lon), 180, 1e-9);
  near("極通過後も |p| = 1", Math.hypot(...p), 1, 1e-12);
  near("極通過後も p·t = 0", S.dot(p, t), 0, 1e-12);
}
{
  // 1万ステップ回しても正規直交性が崩れないこと（毎フレーム再正規化の効果）
  const p = S.toVec(23.7, 120.9);
  const t = S.tangentFromBearing(p, 1.1);
  for (let i = 0; i < 10000; i++) {
    S.advance(p, t, 0.003);
    S.turn(p, t, 0.01);
  }
  near("1万ステップ後も |p| = 1", Math.hypot(...p), 1, 1e-9);
  near("1万ステップ後も p·t = 0", S.dot(p, t), 0, 1e-9);
  near("1万ステップ後も |t| = 1", Math.hypot(...t), 1, 1e-9);
}

// --- 方位角 ---
section("方位角（元ゲーム toward() の球面版）");
{
  const p = S.toVec(0, 0);
  near("真北の方位角 = 0", S.bearing(p, S.toVec(10, 0)), 0, 1e-9);
  near("真東の方位角 = +90 度", S.bearing(p, S.toVec(0, 10)) / S.DEG, 90, 1e-9);
  near("真南の方位角 = 180 度", Math.abs(S.bearing(p, S.toVec(-10, 0)) / S.DEG), 180, 1e-9);
  near("真西の方位角 = -90 度", S.bearing(p, S.toVec(0, -10)) / S.DEG, -90, 1e-9);
}
{
  // bearing → tangentFromBearing → advance が往復すること
  const p = S.toVec(23.7, 120.9);
  const q = S.toVec(35.0, 139.0);
  const t = S.tangentFromBearing(p, S.bearing(p, q));
  const moved = [...p];
  const mt = [...t];
  S.advance(moved, mt, S.angle(p, q));
  near("方位角どおりに進むと目標に到達する", S.degToKm(S.angleDeg(moved, q)), 0, 1e-6);
}
{
  const p = S.toVec(89.995, 0);
  const prev = S.tangentBasis(S.toVec(89.9, 0)).north;
  const b = S.tangentBasis(p, prev);
  check("極近傍でも基底が有限（NaN を出さない）", b.east.every(Number.isFinite) && b.north.every(Number.isFinite));
  near("極近傍でも east ⟂ north", S.dot(b.east, b.north), 0, 1e-9);
  near("極近傍でも north ⟂ p", S.dot(b.north, p), 0, 1e-9);
}
check("wrapAngle が (-π, π] に畳む", Math.abs(S.wrapAngle(3 * Math.PI) - Math.PI) < 1e-9 && Math.abs(S.wrapAngle(-1.5 * Math.PI) - Math.PI / 2) < 1e-9);

summary("sphere");
