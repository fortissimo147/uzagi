#!/usr/bin/env node
// world-atlas の TopoJSON を src/data/geo.js へ焼き込む。DESIGN.md §3.3 / §3.4。
//
//   npm run bake:geo
//   TE_LAND=land-50m.json npm run bake:geo   # 軽い版に切り替える（§3.3）
//
// 生成物 src/data/geo.js はコミットする。手で編集しない。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as topojson from "topojson-client";

const require_ = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const LAND_FILE = process.env.TE_LAND || "land-10m.json";
const PLAYER_FILE = "countries-10m.json";
const PLAYER_ID = "158"; // Taiwan (ISO 3166-1 numeric)

const atlas = (name) => JSON.parse(readFileSync(require_.resolve(`world-atlas/${name}`), "utf8"));

// ---- 球面ヘルパ（tools 内で自己完結させる。src/ に依存しない） ----
const D = Math.PI / 180;
const vec = (lat, lon) => [Math.cos(lat * D) * Math.sin(lon * D), Math.sin(lat * D), Math.cos(lat * D) * Math.cos(lon * D)];

function ringsOf(geojsonGeometry) {
  const g = geojsonGeometry;
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  throw new Error(`unsupported geometry ${g.type}`);
}
function bboxOf(ring) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of ring) {
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }
  return b;
}
// 経度の巻き数。±1 なら極を囲むリング（§3.3b）。
function poleWinding(ring) {
  let w = 0;
  for (let i = 0; i < ring.length; i++) {
    let d = ring[(i + 1) % ring.length][0] - ring[i][0];
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    w += d;
  }
  return Math.round(w / 360);
}
// 平面 ray casting。自国ポリゴンの特定にだけ使う局所判定。
function inPoly(pt, ring) {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function sphericalCentroid(ring) {
  let s = [0, 0, 0];
  for (const [lon, lat] of ring) {
    const u = vec(lat, lon);
    s[0] += u[0];
    s[1] += u[1];
    s[2] += u[2];
  }
  const n = Math.hypot(s[0], s[1], s[2]);
  s = s.map((v) => v / n);
  return [Math.atan2(s[0], s[2]) / D, Math.asin(s[1]) / D];
}

// ---- 量子化 + 連続差分 + Base64（§3.3） ----
const Q = 65535;
class Packer {
  constructor(box) {
    this.box = box; // [lonMin, latMin, lonMax, latMax]
    this.q = [];
    this.px = 0;
    this.py = 0;
    this.dropped = 0;
  }
  /**
   * リングを 1 本まるごと詰める。量子化で同じ格子に落ちた連続頂点は捨てる
   * （末尾が先頭と同じ格子に落ちる場合も含む）。退化した辺を残さないため。
   * 詰めた頂点数を返す。
   */
  pushRing(ring) {
    const [x0, y0, x1, y1] = this.box;
    const qs = [];
    for (const [lon, lat] of ring) {
      const qx = Math.max(0, Math.min(Q, Math.round(((lon - x0) / (x1 - x0)) * Q)));
      const qy = Math.max(0, Math.min(Q, Math.round(((lat - y0) / (y1 - y0)) * Q)));
      const last = qs[qs.length - 1];
      if (last && last[0] === qx && last[1] === qy) {
        this.dropped++;
        continue;
      }
      qs.push([qx, qy]);
    }
    while (qs.length > 1 && qs[0][0] === qs[qs.length - 1][0] && qs[0][1] === qs[qs.length - 1][1]) {
      qs.pop();
      this.dropped++;
    }
    for (const [qx, qy] of qs) {
      // 連続差分。復元は (prev + d) & 0xFFFF なので int16 への切り詰めは可逆。
      this.q.push(((qx - this.px) << 16) >> 16, ((qy - this.py) << 16) >> 16);
      this.px = qx;
      this.py = qy;
    }
    return qs.length;
  }
  toBase64() {
    const a = Int16Array.from(this.q);
    return Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString("base64");
  }
}

// ---- プレイヤー本体（台湾本島 = 最大リング） ----
const cTopo = atlas(PLAYER_FILE);
const cFeat = topojson.feature(cTopo, cTopo.objects.countries).features.find((f) => f.id === PLAYER_ID);
if (!cFeat) throw new Error(`country ${PLAYER_ID} not found in ${PLAYER_FILE}`);
let playerRing = [];
for (const poly of ringsOf(cFeat.geometry)) if (poly[0].length > playerRing.length) playerRing = poly[0];
// GeoJSON のリングは末尾が先頭と同じ。判定・描画では閉じ点を持たない形にそろえる。
if (playerRing.length > 1) {
  const a = playerRing[0];
  const b = playerRing[playerRing.length - 1];
  if (a[0] === b[0] && a[1] === b[1]) playerRing = playerRing.slice(0, -1);
}
const playerBox = bboxOf(playerRing);
const playerCentroid = sphericalCentroid(playerRing);
const pp = new Packer(playerBox);
const playerN = pp.pushRing(playerRing);

// ---- 陸（自国ポリゴンを除く） ----
const lTopo = atlas(LAND_FILE);
const lFeat = topojson.feature(lTopo, lTopo.objects.land);
const allPolys = ringsOf(lFeat.type === "Feature" ? lFeat.geometry : lFeat.features[0].geometry);

const dupIdx = [];
allPolys.forEach((poly, i) => {
  if (inPoly(playerCentroid, poly[0])) dupIdx.push(i);
});
if (dupIdx.length !== 1) throw new Error(`自国ポリゴンの特定に失敗: ${dupIdx.length} 個一致 (期待 1)`);
const landPolys = allPolys.filter((_, i) => i !== dupIdx[0]);

const landBox = [-180, -90, 180, 90];
const lp = new Packer(landBox);
const polygons = [];
let cursor = 0;
for (const poly of landPolys) {
  const rings = [];
  for (let ri = 0; ri < poly.length; ri++) {
    let ring = poly[ri];
    if (ring.length > 1) {
      const a = ring[0];
      const b = ring[ring.length - 1];
      if (a[0] === b[0] && a[1] === b[1]) ring = ring.slice(0, -1);
    }
    if (ring.length < 3) continue;
    const w = poleWinding(ring);
    const mark = { len: lp.q.length, px: lp.px, py: lp.py };
    const n = lp.pushRing(ring);
    if (n < 3) {
      // 量子化で潰れたリングは捨てる。差分の基準点も巻き戻さないと後続がずれる。
      lp.q.length = mark.len;
      lp.px = mark.px;
      lp.py = mark.py;
      continue;
    }
    rings.push({ o: cursor, n, w });
    cursor += n;
  }
  if (!rings.length) continue;
  const outer = poly[0];
  polygons.push({ r: rings, b: bboxOf(outer).map((v) => +v.toFixed(4)) });
}

// ---- 書き出し ----
const out = {
  source: { land: LAND_FILE, player: `${PLAYER_FILE}#${PLAYER_ID}`, atlas: "world-atlas@2 (Natural Earth, public domain)" },
  player: { box: playerBox.map((v) => +v.toFixed(6)), n: playerN, data: pp.toBase64() },
  land: { box: landBox, polygons, points: cursor, data: lp.toBase64() },
};

const header = `// 生成物。手で編集しない。\`npm run bake:geo\` で再生成する。
// 出典: Natural Earth (public domain) を world-atlas@2 (ISC, (c) 2013-2019 Michael Bostock) が TopoJSON 化したもの。
// land   : ${LAND_FILE}  ${polygons.length} ポリゴン / ${cursor} 頂点（自国ポリゴン 1 個を除去済み）
// player : ${PLAYER_FILE} id=${PLAYER_ID} の最大リング  ${playerN} 頂点
// 座標は Int16 量子化 + 連続差分 + Base64。復号は src/world/geo.js。
`;
mkdirSync(resolve(ROOT, "src/data"), { recursive: true });
writeFileSync(resolve(ROOT, "src/data/geo.js"), `${header}\nexport const GEO = ${JSON.stringify(out)};\n`);

const bytes = Buffer.byteLength(readFileSync(resolve(ROOT, "src/data/geo.js")));
console.log(`land   : ${LAND_FILE} → ${polygons.length} ポリゴン / ${cursor} 頂点`);
console.log(`player : ${playerN} 頂点 / bbox ${out.player.box.join(", ")}`);
console.log(`量子化で潰れて捨てた頂点: ${pp.dropped + lp.dropped}`);
console.log(`除去した自国ポリゴン index: ${dupIdx[0]}`);
console.log(`極を囲むリング: ${polygons.reduce((a, p) => a + p.r.filter((r) => r.w !== 0).length, 0)} 本`);
console.log(`src/data/geo.js  ${(bytes / 1024).toFixed(0)} KiB`);
