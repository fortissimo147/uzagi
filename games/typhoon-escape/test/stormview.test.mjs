// 渦の形状の検査。DESIGN.md §4.3。
// 「見た目と当たり判定を一致させる」という約束を機械的に見張る。
import { check, near, section, summary } from "./harness.mjs";
import * as S from "../src/world/sphere.js";
import { spiralArms } from "../src/render/stormview.js";
import { CFG } from "../src/rules/config.js";

section("対数螺旋の腕（§4.3）");

const R = 1;
const LIFT = 1.002;
const c = S.toVec(23.7, 121.0);
const rDeg = 1.5;
const arms = spiralArms(c, rDeg, 0, 1, CFG);

check("頂点が出ている", arms.length > 0, `${arms.length / 3} 頂点`);
check("三角形として割り切れる（3頂点=1枚）", arms.length % 9 === 0, `${arms.length}`);
check(`腕の本数ぶんある（${CFG.ARMS} 本）`, arms.length / 9 === CFG.ARMS * 22 * 2, `${arms.length / 9} 枚`);

{
  let onSphere = true;
  let maxRho = 0;
  let minRho = 999;
  for (let i = 0; i < arms.length; i += 3) {
    const v = [arms[i], arms[i + 1], arms[i + 2]];
    const len = Math.hypot(...v);
    if (Math.abs(len - R * LIFT) > 1e-5) onSphere = false;
    const u = v.map((x) => x / len);
    const d = S.angleDeg(c, u);
    if (d > maxRho) maxRho = d;
    if (d < minRho) minRho = d;
  }
  check("全頂点が球面上にある（地表から浮いていない）", onSphere);
  check(`腕が外側半径からはみ出さない（最大 ${maxRho.toFixed(3)}° / 半径 ${rDeg}°）`, maxRho <= rDeg * 1.02);
  check(`腕が眼の内側から始まる（最小 ${minRho.toFixed(3)}° / 眼 ${(rDeg * CFG.EYE).toFixed(3)}°）`, minRho < rDeg * CFG.EYE * 1.6);
  check("腕が半径の大半をおおう", maxRho > rDeg * 0.7, `${maxRho.toFixed(3)}`);
}

section("回転で形が変わること");
{
  const a = spiralArms(c, rDeg, 0, 1, CFG);
  const b = spiralArms(c, rDeg, 0.5, 1, CFG);
  let moved = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 1e-6) moved++;
  check("位相を変えると頂点が動く", moved > a.length * 0.5, `${moved} / ${a.length}`);

  // 位相を 1 周ぶんずらすと、腕は入れ替わるだけで見た目が同じになるはず
  const c2 = spiralArms(c, rDeg, (2 * Math.PI) / CFG.ARMS, 1, CFG);
  const setOf = (arr) => new Set([...arr].map((x) => x.toFixed(5)));
  const s1 = setOf(a);
  const s2 = setOf(c2);
  let common = 0;
  for (const v of s2) if (s1.has(v)) common++;
  check("腕1本ぶん回すと元と同じ形に戻る（腕が等間隔）", common > s2.size * 0.9, `${common} / ${s2.size}`);
}

section("南北で巻きの向きが逆になること");
{
  const n = spiralArms(c, rDeg, 0, 1, CFG);
  const sflip = spiralArms(c, rDeg, 0, -1, CFG);
  // 中心から見た方位角の変化の符号で向きを見る
  const bearingAt = (arr, i) => {
    const v = [arr[i], arr[i + 1], arr[i + 2]];
    const len = Math.hypot(...v);
    return S.bearing(c, v.map((x) => x / len));
  };
  const drift = (arr) => {
    let sum = 0;
    for (let i = 0; i + 3 < arr.length; i += 3) {
      let d = bearingAt(arr, i + 3) - bearingAt(arr, i);
      d = Math.atan2(Math.sin(d), Math.cos(d));
      sum += d;
    }
    return sum;
  };
  const dn = drift(n);
  const ds = drift(sflip);
  check("北半球と南半球で巻きの向きが逆", Math.sign(dn) === -Math.sign(ds) && dn !== 0, `北 ${dn.toFixed(2)} / 南 ${ds.toFixed(2)}`);
}

section("見た目と当たり判定の一致（§4.3 の約束）");
{
  // 致死半径は外側の 0.55 倍。渦の飾りはこの値に一切影響しない。
  near("致死半径 = 外側 × 0.55", rDeg * CFG.LETHAL, rDeg * 0.55, 1e-12);
  const inner = spiralArms(c, rDeg * CFG.LETHAL, 0, 1, CFG);
  check("小さい台風でも腕は生成できる（半径に比例するだけ）", inner.length === arms.length);
}

summary("stormview");
