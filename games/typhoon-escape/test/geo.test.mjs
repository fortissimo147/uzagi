import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import * as topojson from "topojson-client";
import { check, near, section, summary } from "./harness.mjs";
import { loadPlayerRing, loadLandBodies, GEO_SOURCE } from "../src/world/geo.js";

const require_ = createRequire(import.meta.url);

section("焼き込み地図データ（DESIGN.md §3.2 / §3.3）");

const player = loadPlayerRing();
check("台湾本島のリングが 1 本・頂点 403（末尾の閉じ点を除いた 404）", player.length === 403, `実際 ${player.length}`);

// 焼き込みは「量子化 → 連続差分 → Base64」なので、元データとの往復誤差を直接測る。
// bbox だけを丸めた期待値と比べると、丸めのほうが誤差より大きくて意味をなさない。
const cTopo = JSON.parse(readFileSync(require_.resolve("world-atlas/countries-10m.json"), "utf8"));
const twn = topojson.feature(cTopo, cTopo.objects.countries).features.find((f) => f.id === "158");
let srcRing = [];
for (const poly of twn.geometry.coordinates) if (poly[0].length > srcRing.length) srcRing = poly[0];
srcRing = srcRing.slice(0, -1); // GeoJSON の閉じ点を落とす

const M_PER_DEG = 111319.5;
check("元データと同じ頂点数に復号される", player.length === srcRing.length, `元 ${srcRing.length} / 復号 ${player.length}`);
let maxErr = 0;
for (let i = 0; i < Math.min(player.length, srcRing.length); i++) {
  const dx = (player[i][0] - srcRing[i][0]) * Math.cos((srcRing[i][1] * Math.PI) / 180);
  const dy = player[i][1] - srcRing[i][1];
  maxErr = Math.max(maxErr, Math.hypot(dx, dy) * M_PER_DEG);
}
check("全 403 頂点が元データと 10 m 以内で一致", maxErr < 10, `最大誤差 ${maxErr.toFixed(2)} m`);

// bbox は §3.2 に載せた実測値（小数3桁）と 30 m 以内で一致すればよい。
const b = player.reduce(
  (a, [x, y]) => [Math.min(a[0], x), Math.min(a[1], y), Math.max(a[2], x), Math.max(a[3], y)],
  [Infinity, Infinity, -Infinity, -Infinity]
);
for (const [name, got, want] of [
  ["西端", b[0], 120.052],
  ["南端", b[1], 21.905],
  ["東端", b[2], 122.007],
  ["北端", b[3], 25.287],
]) {
  check(
    `台湾本島 ${name} が §3.2 の実測値と一致（表記は小数3桁）`,
    Math.abs(got - want) * M_PER_DEG < 30,
    `期待 ${want}、実際 ${got.toFixed(6)}`
  );
}

const land = loadLandBodies();
check("陸ポリゴンが 4,000 本以上ある（land-10m 全域）", land.length > 4000, `実際 ${land.length}`);
check("自国ポリゴンが除去されている（台湾本島の重心が陸の内側にない）", (() => {
  const cx = (b[0] + b[2]) / 2;
  const cy = (b[1] + b[3]) / 2;
  const inPoly = (pt, ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return !land.some((p) => inPoly([cx, cy], p.rings[0]));
})());

// §3.3b 南極
const polar = land.flatMap((p) => p.rings).filter((r) => r.winding !== 0);
check("極を囲むリングがちょうど 1 本（南極大陸）", polar.length === 1, `実際 ${polar.length}`);
if (polar.length === 1) {
  const lats = polar[0].map((c) => c[1]);
  check("そのリングは南半球にある", Math.max(...lats) < -55, `最北 ${Math.max(...lats).toFixed(3)}`);
  near("最南端が -85.222°（10m 実測）", Math.min(...lats), -85.222, 0.01);
  const w = polar[0].winding;
  check("巻き数が ±1", Math.abs(w) === 1, `実際 ${w}`);
  // 極まで届いていない = 素朴な分割だと穴が開く。§3.3b の扇形分割が要る根拠。
  check("最南端が南極点に届いていない（扇形分割が必要）", Math.min(...lats) > -90);
}

// 南極が「除外されていない」こと自体の検査（元ゲームは maxLat < -55 で捨てていた）
const antarcticBodies = land.filter((p) => p.bbox[3] < -55);
check("maxLat < -55 の陸が残っている（元の除外を撤廃した）", antarcticBodies.length > 100, `実際 ${antarcticBodies.length}`);

// リングの健全性
let degenerate = 0;
let unclosed = 0;
for (const p of land) {
  for (const r of p.rings) {
    if (r.length < 3) degenerate++;
    const a = r[0];
    const z = r[r.length - 1];
    if (a[0] === z[0] && a[1] === z[1]) unclosed++;
  }
}
check("3 頂点未満のリングがない", degenerate === 0, `実際 ${degenerate}`);
check("末尾に閉じ点が残っていない", unclosed === 0, `実際 ${unclosed}`);

check("出典が記録されている", GEO_SOURCE.atlas.includes("Natural Earth"), GEO_SOURCE.atlas);

summary("geo");
