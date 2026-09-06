import { check, near, section, summary } from "./harness.mjs";
import { loadLandBodies, loadPlayerRing } from "../src/world/geo.js";
import { tessellatePolygon, meshArea, maxEdgeChord } from "../src/world/tessellate.js";
import { R_KM, DEG } from "../src/world/sphere.js";

section("球面三角形分割（DESIGN.md §3.3b / §4.1）");

// 分割の正しさは目視では分からないので、面積で機械的に検算する。
// 基準は Chamberlain & Duquette の球面多角形面積公式（分割とは独立の計算）。
function ringArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    let d = (x2 - x1) * DEG;
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    s += d * (2 + Math.sin(y1 * DEG) + Math.sin(y2 * DEG));
  }
  return Math.abs(s / 2); // ステラジアン
}

const land = loadLandBodies();
let totalMesh = 0;
let totalRef = 0;
let worstRel = 0;
let worstName = "";
let tris = 0;
let maxChord = 0;
let nanCount = 0;

for (let i = 0; i < land.length; i++) {
  const { positions, indices } = tessellatePolygon(land[i].rings);
  if (![...positions].every(Number.isFinite)) nanCount++;
  tris += indices.length / 3;
  maxChord = Math.max(maxChord, maxEdgeChord(positions, indices));
  const a = meshArea(positions, indices);
  let ref = ringArea(land[i].rings[0]);
  for (let r = 1; r < land[i].rings.length; r++) ref -= ringArea(land[i].rings[r]);
  totalMesh += a;
  totalRef += ref;
  if (ref > 1e-4) {
    const rel = Math.abs(a - ref) / ref;
    if (rel > worstRel) {
      worstRel = rel;
      worstName = `poly#${i} (${land[i].rings[0].length} 頂点, bbox ${land[i].bbox.join(",")})`;
    }
  }
}

check("NaN を出すポリゴンがない", nanCount === 0, `${nanCount} 件`);
check(`全 ${land.length} ポリゴンが分割できた（三角形 ${tris.toLocaleString()} 枚）`, tris > land.length);

const SPHERE = 4 * Math.PI;
const km2 = (sr) => (sr * R_KM * R_KM) / 1e6; // 百万 km²
near("分割面積と球面多角形公式が 0.5% 以内で一致", totalMesh / totalRef, 1, 0.005);
check(
  `陸地の総面積が地球表面の 25–35%（実際 ${((100 * totalMesh) / SPHERE).toFixed(1)}%, ${km2(totalMesh).toFixed(1)} 百万 km²）`,
  totalMesh / SPHERE > 0.25 && totalMesh / SPHERE < 0.35
);
check(`面積が最もずれたポリゴンでも 2% 以内（${(100 * worstRel).toFixed(2)}%）`, worstRel < 0.02, worstName);

// 三角形が地表から浮きすぎないこと（長い弦は球の内側をえぐる）
const sagKm = (1 - Math.sqrt(1 - (maxChord / 2) ** 2)) * R_KM;
check(`最長の辺でも地表からの沈み込みが 50 km 未満（${sagKm.toFixed(1)} km）`, sagKm < 50, `最長弦 ${maxChord.toFixed(4)}`);

section("南極 — 極に穴を開けないこと（§3.3b）");
const antIdx = land.findIndex((p) => p.rings[0].winding !== 0);
check("極を囲むポリゴンが 1 つある", antIdx >= 0);
{
  const { positions, indices } = tessellatePolygon(land[antIdx].rings);
  // 南極点そのものが頂点として存在するか
  let hasPole = false;
  for (let i = 0; i < positions.length; i += 3) {
    if (Math.abs(positions[i]) < 1e-6 && Math.abs(positions[i + 2]) < 1e-6 && positions[i + 1] < -0.999) hasPole = true;
  }
  check("南極点 (0,-1,0) が頂点として存在する", hasPole);
  // 南極点が三角形に覆われているか（扇の要なので全三角形が参照するはず）
  let uses = 0;
  const poleIdxs = new Set();
  for (let i = 0; i < positions.length; i += 3)
    if (Math.abs(positions[i]) < 1e-6 && Math.abs(positions[i + 2]) < 1e-6 && Math.abs(positions[i + 1]) > 0.999)
      poleIdxs.add(i / 3);
  for (const v of indices) if (poleIdxs.has(v)) uses++;
  check("南極点を通る三角形がある（穴が塞がっている）", uses > 0, `${uses} 枚`);
  // 面積が公式と一致（極を囲むリングでも）
  near("南極の分割面積が公式と一致", meshArea(positions, indices) / ringArea(land[antIdx].rings[0]), 1, 0.01);
  check("南極の面積が地球表面の 2–4%", (() => {
    const f = meshArea(positions, indices) / SPHERE;
    return f > 0.02 && f < 0.04;
  })(), `${((100 * meshArea(positions, indices)) / SPHERE).toFixed(2)}%`);
}

section("日付変更線をまたぐリング");
{
  const crossing = land.filter((p) =>
    p.rings.some((r) => {
      for (let k = 0; k < r.length; k++) if (Math.abs(r[(k + 1) % r.length][0] - r[k][0]) > 180) return true;
      return false;
    })
  );
  check("またぐリングを含むポリゴンが存在する（検査対象がある）", crossing.length > 0, `${crossing.length} 件`);
  let ok = true;
  for (const p of crossing) {
    const { positions, indices } = tessellatePolygon(p.rings);
    const a = meshArea(positions, indices);
    let ref = ringArea(p.rings[0]);
    for (let r = 1; r < p.rings.length; r++) ref -= ringArea(p.rings[r]);
    if (ref > 1e-6 && Math.abs(a - ref) / ref > 0.02) ok = false;
  }
  check("またぐポリゴンも面積が 2% 以内で一致（経度の巻き戻しが効いている）", ok);
}

section("プレイヤー本体（台湾本島）");
{
  const ring = loadPlayerRing();
  const { positions, indices } = tessellatePolygon([ring]);
  check("分割できる", indices.length > 0);
  near("面積が公式と 1% 以内で一致", meshArea(positions, indices) / ringArea(ring), 1, 0.01);
  const areaKm2 = meshArea(positions, indices) * R_KM * R_KM;
  check(`面積が 3.0–4.0 万 km²（実際 ${(areaKm2 / 1e4).toFixed(2)} 万 km²）`, areaKm2 > 3.0e4 && areaKm2 < 4.0e4);
}

summary("tessellate");
