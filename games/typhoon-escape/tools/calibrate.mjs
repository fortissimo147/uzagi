#!/usr/bin/env node
// DESIGN.md §1b / §3 の数値を world-atlas の実データから再生成する。
// 設計値を記憶や手計算で書かないための道具。
//   node tools/calibrate.mjs
// 事前に `npm i` で world-atlas@2 を devDependency として入れておくこと。
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
function atlas(name) {
  try {
    return JSON.parse(readFileSync(require_.resolve(`world-atlas/${name}`), "utf8"));
  } catch {
    console.error(`world-atlas/${name} が見つかりません。先に \`npm i\` を実行してください。`);
    process.exit(1);
  }
}

// ---- TopoJSON の最小デコーダ（元ゲームの decodeTopo と同じ手順） ----
function decoder(topo) {
  const [sx, sy] = topo.transform.scale;
  const [tx, ty] = topo.transform.translate;
  const arcs = topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map((p) => {
      x += p[0]; y += p[1];
      return [x * sx + tx, y * sy + ty];
    });
  });
  return (idx) => {
    let out = [];
    for (const i of idx) {
      let a = i < 0 ? arcs[~i].slice().reverse() : arcs[i];
      if (out.length) a = a.slice(1);
      out = out.concat(a);
    }
    return out;
  };
}
function geometry(topo, collection, id) {
  const g = topo.objects[collection].geometries.find((x) => x.id === id);
  if (!g) throw new Error(`geometry ${id} not found in ${collection}`);
  return g.type === "Polygon" ? [g.arcs] : g.arcs;
}

// ---- 球面ヘルパ ----
const R_KM = 6371.0088; // IUGG 平均半径
const D = Math.PI / 180;
const vec = (lat, lon) => [Math.cos(lat * D) * Math.sin(lon * D), Math.sin(lat * D), Math.cos(lat * D) * Math.cos(lon * D)];
const ang = (p, q) => Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2])));
const km = (deg) => deg * D * R_KM;
const f = (x, n = 4) => Number(x).toFixed(n);

function centroid(pts) {
  let s = [0, 0, 0];
  for (const c of pts) { const u = vec(c[1], c[0]); s[0] += u[0]; s[1] += u[1]; s[2] += u[2]; }
  const n = Math.hypot(...s);
  return s.map((x) => x / n);
}
function circumradiusDeg(pts, c = centroid(pts)) {
  let max = 0;
  for (const p of pts) max = Math.max(max, ang(c, vec(p[1], p[0])));
  return max / D;
}
function spanDeg(pts) {
  let max = 0;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      max = Math.max(max, ang(vec(pts[i][1], pts[i][0]), vec(pts[j][1], pts[j][0])));
  return max / D;
}
function bbox(pts) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const c of pts) {
    b[0] = Math.min(b[0], c[0]); b[1] = Math.min(b[1], c[1]);
    b[2] = Math.max(b[2], c[0]); b[3] = Math.max(b[3], c[1]);
  }
  return b;
}
// リングが極を囲むか（経度の巻き数が ±1 なら囲む）
function poleWinding(ring) {
  let w = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i][0], b = ring[(i + 1) % ring.length][0];
    let d = b - a;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    w += d;
  }
  return w / 360;
}
// 平面 ray casting（局所判定にのみ使う。元ゲームの inPoly と同じ）
function inPoly(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---- 元ゲームの定数（typhoon-escape.html の <script> より） ----
const ORIG = {
  W: 400, H: 700, M: 700, LONW: 110,
  PHI_J: 37,   // py(37) — 元ゲームが日本を置いた緯度
  K: 1.6,      // 自国の拡大率
  lethal: 0.55,
};
const M = ORIG.M;

let bad = 0;
const ok = (cond, label, detail = "") => {
  if (!cond) bad++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? `  ${detail}` : ""}`);
  return cond;
};

// ================= 実測 =================
console.log("== 実測 ==");
const c110 = atlas("countries-110m.json");
const c10 = atlas("countries-10m.json");
const l50 = atlas("land-50m.json");

const r110 = decoder(c110), r10 = decoder(c10), rl50 = decoder(l50);

// 元ゲームのプレイヤー本体 = countries-110m の日本（全リング）
const JP = [];
for (const poly of geometry(c110, "countries", "392")) for (const r of poly) JP.push(...r110(r));
const rhoJ = circumradiusDeg(JP);

// 本作のプレイヤー本体 = countries-10m の台湾のうち最大リング（本島のみ）
let TW = [];
for (const poly of geometry(c10, "countries", "158")) {
  const o = r10(poly[0]);
  if (o.length > TW.length) TW = o;
}
const cTW = centroid(TW);
const rhoT = circumradiusDeg(TW, cTW);
const bTW = bbox(TW);

console.log(`日本 110m 全島: 頂点 ${JP.length} / 外接角半径 ${f(rhoJ, 4)}° = ${f(km(rhoJ), 1)} km / スパン ${f(spanDeg(JP), 4)}°`);
console.log(`台湾 10m 本島 : 頂点 ${TW.length} / 外接角半径 ${f(rhoT, 4)}° = ${f(km(rhoT), 1)} km / スパン ${f(spanDeg(TW), 4)}°`);
console.log(`  bbox lon ${f(bTW[0], 3)}–${f(bTW[2], 3)} / lat ${f(bTW[1], 3)}–${f(bTW[3], 3)}`);
console.log(`  bbox ローカル Int16 量子化: 経度 ${f(((bTW[2] - bTW[0]) / 65535) * 111.3195 * 1000, 1)} m / 緯度 ${f(((bTW[3] - bTW[1]) / 65535) * 111.3195 * 1000, 1)} m`);
console.log(`サイズ比 日本/台湾本島: 外接半径 ${f(rhoJ / rhoT, 4)} 倍 / スパン ${f(spanDeg(JP) / spanDeg(TW), 4)} 倍`);

// ================= 換算定数 =================
console.log("\n== 換算定数 ==");
const mJ = (ORIG.W / ORIG.LONW) / Math.cos(ORIG.PHI_J * D); // px / 度(弧長) @ lat37
const bodyPx = rhoJ * mJ * ORIG.K;                          // 元での自国の描画外接半径 [px]
const bodyDeg = rhoT * ORIG.K;                              // 球面での自国の描画外接角半径 [°]
const A = bodyDeg / bodyPx;                                 // 度(弧長) / 元px
console.log(`元マップの弧長スケール @lat${ORIG.PHI_J} = ${f(mJ)} px/°`);
console.log(`元での自国の描画外接半径   = ${f(bodyPx, 2)} px`);
console.log(`球面での自国の描画外接半径 = ${f(bodyDeg)}° = ${f(km(bodyDeg), 1)} km`);
console.log(`A = ${f(A, 6)} 度(弧長) / 元px`);

// ================= 換算表 =================
console.log("\n== 換算表（DESIGN.md §1b.3）==");
const row = (label, px) =>
  console.log(`  ${label.padEnd(28)}${f(px, 3).padStart(9)} px ${f(px * A).padStart(9)}° ${f(km(px * A), 1).padStart(9)} km`);
row("台風 初期半径(外)", M * 0.015);
row("台風 ピーク半径(外) 最小", M * 0.05);
row("台風 ピーク半径(外) 最大", M * 0.05 + M * 0.035);
row("致死半径 ピーク最小", M * 0.05 * ORIG.lethal);
row("致死半径 ピーク最大", (M * 0.05 + M * 0.035) * ORIG.lethal);
row("消滅しきい値(外)", M * 0.012);
row("プレイヤー速度 /s", M * 0.125);
row("台風速度 t=0 /s", M * 0.09);
row("台風加速 /s^2", M * 0.0035);
row("台風速度 t=30日 /s", M * 0.09 + 30 * M * 0.0035);
row("停滞時速度 t=0 /s", M * 0.09 * 0.15);
row("押しのけ判定余白", 120);
row("滑走停止しきい値 /s", 0.5);
row("プレイ窓 幅", ORIG.W);
row("プレイ窓 高さ", ORIG.H);
row("発生マージン", 60);
row("強制消滅マージン", 150);

console.log("\n== 難度曲線 ==");
const spd = M * 0.125 * A;
console.log(`プレイヤー ${f(spd)}°/s = ${f(km(spd), 1)} km/ゲーム内日 = ${f(km(spd) / 24, 2)} km/h`);
for (const t of [0, 10, 30, 60]) {
  const s = (M * 0.09 + t * M * 0.0035) * A;
  console.log(`  台風 t=${String(t).padStart(2)}日: ${f(s)}°/s = ${f(km(s) / 24, 2)} km/h  (対プレイヤー ${f(s / spd, 2)}倍)`);
}
console.log(`速度逆転 t = ${f((0.125 - 0.09) / 0.0035, 2)} ゲーム内日`);
console.log(`半球横断 ${f(180 / spd, 1)} 日 / 赤道一周 ${f(360 / spd, 1)} 日`);

// ================= 無次元比の保存 =================
console.log("\n== 無次元比の保存（元 : 球面。一致すること）==");
for (const [name, a, b] of [
  ["致死半径(ピーク最大)/自国外接半径", ((M * 0.05 + M * 0.035) * ORIG.lethal) / bodyPx, ((M * 0.05 + M * 0.035) * ORIG.lethal * A) / bodyDeg],
  ["プレイヤー速度/自国外接半径 [/s]", (M * 0.125) / bodyPx, (M * 0.125 * A) / bodyDeg],
  ["プレイ窓幅/自国外接半径", ORIG.W / bodyPx, (ORIG.W * A) / bodyDeg],
]) ok(Math.abs(a - b) < 1e-9, name.padEnd(36), `${f(a, 6)} : ${f(b, 6)}`);

// ================= 上陸地域 =================
console.log("\n== 上陸地域カスケード（DESIGN.md §1b.5）==");
// 幾何近似であって行政界ではない。全地域が到達可能であることを検査する。
function region(lon, lat) {
  if (lat >= 24.5) return "Northern Taiwan";
  if (lat >= 24.3 && lon >= 121.4) return "Northern Taiwan"; // 宜蘭
  if (lon >= 120.9 && lat >= 22.6) return "Eastern Taiwan";  // 花蓮・台東
  if (lat >= 23.5) return "Central Taiwan";
  return "Southern Taiwan";
}
const REGIONS = ["Northern Taiwan", "Central Taiwan", "Southern Taiwan", "Eastern Taiwan"];
const count = Object.fromEntries(REGIONS.map((r) => [r, 0]));
for (const c of TW) count[region(c[0], c[1])]++;
for (const r of REGIONS) ok(count[r] > 0, r.padEnd(36), `${String(count[r]).padStart(3)} 頂点 ${f((100 * count[r]) / TW.length, 1).padStart(5)}%`);

// ================= 陸レイヤ =================
console.log("\n== 陸レイヤ（DESIGN.md §3.3）==");
const landPolys = l50.objects.land.geometries[0].arcs;
let rings = 0, pts = 0;
let antarctica = null;
for (const poly of landPolys) {
  const outer = rl50(poly[0]);
  for (const r of poly) { rings++; pts += rl50(r).length; }
  const b = bbox(outer);
  if (b[3] < -55 && (!antarctica || outer.length > antarctica.length)) antarctica = outer;
}
console.log(`land-50m: ポリゴン ${landPolys.length} / リング ${rings} / 頂点 ${pts} (Int16 で ${f((pts * 4) / 1024, 0)} KiB)`);
ok(antarctica !== null, "南極大陸のポリゴンが存在する", `頂点 ${antarctica ? antarctica.length : 0}`);
const wind = poleWinding(antarctica);
ok(Math.abs(Math.abs(wind) - 1) < 1e-6, "南極リングが南極点を囲む", `経度巻き数 ${f(wind, 4)}`);
const southMost = Math.min(...antarctica.map((c) => c[1]));
console.log(`  最南端 ${f(southMost, 3)}° → 南極点まで ${f(90 + southMost, 3)}° = ${f(km(90 + southMost), 0)} km の穴が開く`);
console.log("  → 極を含む扇形三角形分割が必要（§4.1）。素朴な経緯度分割では極に穴が残る。");

// 自国は陸レイヤから抜く（元ゲームが日本に対してやっているのと同じ）
const cenLonLat = [Math.atan2(cTW[0], cTW[2]) / D, Math.asin(cTW[1]) / D];
const dup = [];
landPolys.forEach((poly, i) => { if (inPoly(cenLonLat, rl50(poly[0]))) dup.push(i); });
ok(dup.length === 1, "陸レイヤ内の自国ポリゴンを一意に特定できる", `index ${dup.join(",")}`);
console.log(`  → 陸レイヤは ${landPolys.length} − ${dup.length} = ${landPolys.length - dup.length} ポリゴンになる`);

process.exit(bad ? 1 : 0);
