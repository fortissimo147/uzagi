#!/usr/bin/env node
// DESIGN.md §1b の換算表を再生成する。設計値を記憶や手計算で書かないための道具。
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
function decode(topo) {
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
function points(topo, collection, id) {
  const ring = decode(topo);
  const g = topo.objects[collection].geometries.find((x) => (id === undefined ? true : x.id === id));
  if (!g) throw new Error(`geometry ${id} not found`);
  const polys = g.type === "Polygon" ? [g.arcs] : g.arcs;
  const out = [];
  let rings = 0;
  for (const poly of polys) for (const r of poly) { rings++; for (const c of ring(r)) out.push(c); }
  return { pts: out, rings };
}

// ---- 球面ヘルパ ----
const R_KM = 6371.0088;                       // IUGG 平均半径
const D = Math.PI / 180;
const vec = (lat, lon) => [Math.cos(lat * D) * Math.sin(lon * D), Math.sin(lat * D), Math.cos(lat * D) * Math.cos(lon * D)];
const ang = (p, q) => Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2])));
const km = (deg) => deg * D * R_KM;

function circumradiusDeg(pts) {
  let s = [0, 0, 0];
  for (const c of pts) { const u = vec(c[1], c[0]); s[0] += u[0]; s[1] += u[1]; s[2] += u[2]; }
  const n = Math.hypot(...s);
  s = s.map((x) => x / n);
  let max = 0;
  for (const c of pts) max = Math.max(max, ang(s, vec(c[1], c[0])));
  return max / D;
}
function spanDeg(pts) {
  let max = 0;
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++)
      max = Math.max(max, ang(vec(pts[i][1], pts[i][0]), vec(pts[j][1], pts[j][0])));
  return max / D;
}

// ---- 元ゲームの定数（typhoon-escape.html の <script> より）----
const ORIG = {
  W: 400, H: 700, M: 700, LONW: 110,
  PHI_J: 37,        // py(37) — 日本を置いた緯度
  K: 1.6,           // 自国の拡大率
  playerSpd: 700 * 0.125,
  stormSpd0: 700 * 0.09,
  stormAcc: 700 * 0.0035,
  rInit: 700 * 0.015,
  rPeakMin: 700 * 0.05,
  rPeakMax: 700 * 0.05 + 700 * 0.035,
  rDie: 700 * 0.012,
  lethal: 0.55,
  pushMargin: 120,
  slideCut: 0.5,
  spawnMargin: 60,
  despawnMargin: 150,
};

const c110 = atlas("countries-110m.json");
const c10 = atlas("countries-10m.json");
const jp = points(c110, "countries", "392").pts;     // 元ゲームが埋め込んでいるのと同じ日本
const tw110 = points(c110, "countries", "158").pts;

const rhoJ = circumradiusDeg(jp);
const rhoT = circumradiusDeg(tw110);
const mJ = (ORIG.W / ORIG.LONW) / Math.cos(ORIG.PHI_J * D);   // px / 度(弧長) @ lat37
const bodyPx = rhoJ * mJ * ORIG.K;                            // 元での日本の描画外接半径 [px]
const bodyDeg = rhoT * ORIG.K;                                // 球面での台湾の描画外接角半径 [°]
const A = bodyDeg / bodyPx;                                   // 度(弧長) / 元px

const f = (x, n = 4) => Number(x).toFixed(n);
console.log("== 実測 ==");
console.log(`日本 110m: 頂点 ${jp.length} / 外接角半径 ${f(rhoJ, 3)}° = ${f(km(rhoJ), 1)} km / スパン ${f(spanDeg(jp), 3)}°`);
console.log(`台湾 110m: 頂点 ${tw110.length} / 外接角半径 ${f(rhoT, 3)}° = ${f(km(rhoT), 1)} km / スパン ${f(spanDeg(tw110), 3)}°`);
const tw10 = points(c10, "countries", "158");
console.log(`台湾  10m: 頂点 ${tw10.pts.length} / リング ${tw10.rings}`);
console.log(`サイズ比 日本/台湾: 外接半径 ${f(rhoJ / rhoT, 3)} 倍 / スパン ${f(spanDeg(jp) / spanDeg(tw110), 3)} 倍`);
console.log();
console.log("== 換算定数 ==");
console.log(`元マップの弧長スケール @lat${ORIG.PHI_J} = ${f(mJ)} px/°`);
console.log(`元での自国の描画外接半径 = ${f(bodyPx, 2)} px`);
console.log(`球面での自国の描画外接半径 = ${f(bodyDeg)}° = ${f(km(bodyDeg), 1)} km`);
console.log(`A = ${f(A, 6)} 度(弧長) / 元px`);
console.log();
console.log("== 換算表（DESIGN.md §1b.3）==");
const row = (label, px) =>
  console.log(`${label.padEnd(30)} ${String(f(px, 3)).padStart(9)} px  ${f(px * A).padStart(9)}°  ${f(km(px * A), 1).padStart(9)} km`);
row("台風 初期半径(外)", ORIG.rInit);
row("台風 ピーク半径(外) 最小", ORIG.rPeakMin);
row("台風 ピーク半径(外) 最大", ORIG.rPeakMax);
row("致死半径 ピーク最小", ORIG.rPeakMin * ORIG.lethal);
row("致死半径 ピーク最大", ORIG.rPeakMax * ORIG.lethal);
row("消滅しきい値(外)", ORIG.rDie);
row("プレイヤー速度 /s", ORIG.playerSpd);
row("台風速度 t=0 /s", ORIG.stormSpd0);
row("台風加速 /s^2", ORIG.stormAcc);
row("台風速度 t=30日 /s", ORIG.stormSpd0 + 30 * ORIG.stormAcc);
row("停滞時速度 t=0 /s", ORIG.stormSpd0 * 0.15);
row("押しのけ判定余白", ORIG.pushMargin);
row("滑走停止しきい値 /s", ORIG.slideCut);
row("プレイ窓 幅", ORIG.W);
row("プレイ窓 高さ", ORIG.H);
row("発生マージン", ORIG.spawnMargin);
row("強制消滅マージン", ORIG.despawnMargin);
console.log();
console.log("== 難度曲線 ==");
const spd = ORIG.playerSpd * A;
console.log(`プレイヤー ${f(spd)}°/s = ${f(km(spd), 1)} km/ゲーム内日 = ${f(km(spd) / 24, 2)} km/h`);
for (const t of [0, 10, 30, 60]) {
  const s = (ORIG.stormSpd0 + t * ORIG.stormAcc) * A;
  console.log(`  台風 t=${String(t).padStart(2)}日: ${f(s)}°/s = ${f(km(s) / 24, 2)} km/h  (対プレイヤー ${f(s / spd, 2)}倍)`);
}
console.log(`速度逆転 t = ${f((0.125 - 0.09) / 0.0035, 2)} ゲーム内日`);
console.log(`半球横断 ${f(180 / spd, 1)} 日 / 赤道一周 ${f(360 / spd, 1)} 日`);
console.log();
console.log("== 無次元比の保存（元 : 球面。一致すること）==");
const pairs = [
  ["致死半径(ピーク最大)/自国外接半径", (ORIG.rPeakMax * ORIG.lethal) / bodyPx, (ORIG.rPeakMax * ORIG.lethal * A) / bodyDeg],
  ["プレイヤー速度/自国外接半径 [/s]", ORIG.playerSpd / bodyPx, (ORIG.playerSpd * A) / bodyDeg],
  ["プレイ窓幅/自国外接半径", ORIG.W / bodyPx, (ORIG.W * A) / bodyDeg],
];
let bad = 0;
for (const [name, a, b] of pairs) {
  const ok = Math.abs(a - b) < 1e-9;
  if (!ok) bad++;
  console.log(`  ${ok ? "✓" : "✗"} ${name.padEnd(36)} ${f(a, 6)} : ${f(b, 6)}`);
}
console.log();
console.log("== 上陸地域カスケード（DESIGN.md §1b.5）==");
// 幾何近似であって行政界ではない。全地域が到達可能であることだけを検査する。
function region(lon, lat) {
  if (lon < 119.0) return "the Kinmen Islands";
  if (lon < 120.0) return "the Penghu Islands";
  if (lon >= 121.3 && lat < 23.0) return "Eastern Taiwan";
  if (lat >= 24.5) return "Northern Taiwan";
  if (lat >= 24.3 && lon >= 121.4) return "Northern Taiwan";
  if (lon >= 120.9 && lat >= 22.6) return "Eastern Taiwan";
  if (lat >= 23.5) return "Central Taiwan";
  return "Southern Taiwan";
}
const REGIONS = ["Northern Taiwan", "Central Taiwan", "Southern Taiwan", "Eastern Taiwan", "the Penghu Islands", "the Kinmen Islands"];
const count = Object.fromEntries(REGIONS.map((r) => [r, 0]));
for (const c of tw10.pts) count[region(c[0], c[1])]++;
for (const r of REGIONS) {
  const n = count[r];
  if (!n) bad++;
  console.log(`  ${n ? "\u2713" : "\u2717"} ${r.padEnd(20)} ${String(n).padStart(4)} 頂点  ${f((100 * n) / tw10.pts.length, 1).padStart(5)}%`);
}

process.exit(bad ? 1 : 0);
