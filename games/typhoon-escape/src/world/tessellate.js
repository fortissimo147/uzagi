// 球面ポリゴンの三角形分割。DESIGN.md §3.3b / §4.1。
// three.js に依存しない（§0.3）。出す形は「単位球上の頂点配列 + インデックス」。
import earcut from "earcut";
import { toVec } from "./sphere.js";

/**
 * 経度の巻き戻しを解く。日付変更線をまたぐリング（隣接頂点の経度差 > 180）を
 * 連続した経度列に直す。巻き数 0 のリングなら、これで平面上の単純多角形になる。
 */
function unwrapLon(ring) {
  const out = new Array(ring.length);
  let acc = ring[0][0];
  out[0] = [acc, ring[0][1]];
  for (let i = 1; i < ring.length; i++) {
    let d = ring[i][0] - ring[i - 1][0];
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    acc += d;
    out[i] = [acc, ring[i][1]];
  }
  return out;
}

/**
 * 長い辺を持つ三角形を細分する。
 *
 * earcut は経緯度平面で分割するので、遠く離れた頂点を結ぶ長い三角形が出ることがある。
 * それをそのまま球面に貼ると、平らな三角形が球の内側へ沈み込んで陸に穴が空く
 * （実測で最長弦 1.037＝弧 60 度、沈み込み 924 km）。
 *
 * 辺の中点を共有キャッシュで管理し、隣り合う三角形が同じ中点を使うようにする。
 * これで T 字接合（ひび割れの原因）が生じない。いわゆる red-green 細分の簡易版。
 */
const MAX_EDGE_DEG = 1; // これより長い辺は割る。弧 1 度の沈み込みは約 0.24 km で、最寄りズーム(1.29 km/px)でもサブピクセル。

function refine(src, tri) {
  const D = Math.PI / 180;
  const maxD2 = (2 * Math.sin((MAX_EDGE_DEG / 2) * D)) ** 2; // 弦長の 2 乗で比べる

  // 判定は**球面上の実際の弦長**で行う。経緯度平面の距離で測ると、極の近くで
  // 「経度が離れていても実距離は近い」三角形を割りすぎ／割らなさすぎになる。
  // 三角関数は頂点ごとに 1 回だけ引いて使い回す（辺ごとに引くと桁違いに遅い）。
  let vx = new Float64Array(src.length);
  let vy = new Float64Array(src.length);
  let vz = new Float64Array(src.length);
  const project = (i) => {
    const lat = src[i][1] * D;
    const lon = src[i][0] * D;
    const c = Math.cos(lat);
    vx[i] = c * Math.sin(lon);
    vy[i] = Math.sin(lat);
    vz[i] = c * Math.cos(lon);
  };
  for (let i = 0; i < src.length; i++) project(i);
  const grow = () => {
    if (src.length <= vx.length) return;
    const cap = Math.max(src.length, vx.length * 2);
    const nx = new Float64Array(cap);
    const ny = new Float64Array(cap);
    const nz = new Float64Array(cap);
    nx.set(vx);
    ny.set(vy);
    nz.set(vz);
    vx = nx;
    vy = ny;
    vz = nz;
  };
  const long2 = (a, b) => (vx[a] - vx[b]) ** 2 + (vy[a] - vy[b]) ** 2 + (vz[a] - vz[b]) ** 2;

  // 辺のキーは文字列ではなく数値にする。ポリゴンあたり数十万辺を扱うので効く。
  const KEY = 4194304; // 頂点数の上限。600k 程度なので a*KEY+b は 2^53 に収まる。
  const key = (a, b) => (a < b ? a * KEY + b : b * KEY + a);
  const mid = new Map();
  const midpoint = (a, b) => {
    const k = key(a, b);
    let m = mid.get(k);
    if (m === undefined) {
      m = src.length;
      src.push([(src[a][0] + src[b][0]) / 2, (src[a][1] + src[b][1]) / 2]);
      grow();
      project(m);
      mid.set(k, m);
    }
    return m;
  };

  for (let pass = 0; pass < 12; pass++) {
    // 1) 長い辺に印をつける。印は辺で共有されるので、隣り合う三角形が同じ判断をする。
    const marked = new Set();
    for (let i = 0; i < tri.length; i += 3) {
      const a = tri[i];
      const b = tri[i + 1];
      const c = tri[i + 2];
      if (long2(a, b) > maxD2) marked.add(key(a, b));
      if (long2(b, c) > maxD2) marked.add(key(b, c));
      if (long2(c, a) > maxD2) marked.add(key(c, a));
    }
    if (!marked.size) break;

    // 2) 印のついた辺を割る。T 字接合ができないので隙間も重なりも生じない。
    const next = [];
    for (let i = 0; i < tri.length; i += 3) {
      const a = tri[i];
      const b = tri[i + 1];
      const c = tri[i + 2];
      const mAB = marked.has(key(a, b));
      const mBC = marked.has(key(b, c));
      const mCA = marked.has(key(c, a));
      const n = (mAB ? 1 : 0) + (mBC ? 1 : 0) + (mCA ? 1 : 0);
      if (n === 0) {
        next.push(a, b, c);
      } else if (n === 3) {
        const ab = midpoint(a, b);
        const bc = midpoint(b, c);
        const ca = midpoint(c, a);
        next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
      } else if (n === 1) {
        // 印のある辺を xy に持ってくる
        const [x, y, z] = mAB ? [a, b, c] : mBC ? [b, c, a] : [c, a, b];
        const m = midpoint(x, y);
        next.push(x, m, z, m, y, z);
      } else {
        // 2 辺。印のない辺が zx に来るように並べ替えてから 3 枚へ割る。
        const [x, y, z] = !mAB ? [b, c, a] : !mBC ? [c, a, b] : [a, b, c];
        const m1 = midpoint(x, y);
        const m2 = midpoint(y, z);
        next.push(x, m1, z, m1, y, m2, m1, m2, z);
      }
    }
    tri = next;
  }
  return { tri };
}

/** 三角形の向きを外向きにそろえる。内向きなら 2 頂点を入れ替える。 */
function faceOutward(pos, idx) {
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3;
    const b = idx[i + 1] * 3;
    const c = idx[i + 2] * 3;
    const ux = pos[b] - pos[a];
    const uy = pos[b + 1] - pos[a + 1];
    const uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a];
    const vy = pos[c + 1] - pos[a + 1];
    const vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const cx = pos[a] + pos[b] + pos[c];
    const cy = pos[a + 1] + pos[b + 1] + pos[c + 1];
    const cz = pos[a + 2] + pos[b + 2] + pos[c + 2];
    if (nx * cx + ny * cy + nz * cz < 0) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
  }
}

/**
 * ポリゴン 1 個を三角形分割する。
 * rings[0] が外リング、以降が穴。rings[0].winding が ±1 なら極を囲む。
 *
 * @returns {{positions: Float32Array, indices: Uint32Array, lonlat: Float64Array}}
 */
export function tessellatePolygon(rings) {
  const outer = rings[0];
  const winding = outer.winding || 0;

  // 極を囲むリング（南極）は、経緯度平面でそのまま分割すると極に穴が開く。§3.3b
  // 極から扇を張る素朴な方法も駄目で、海岸線が極から見て星形でない（フィヨルドがある）ため
  // 三角形が海側へはみ出して重なる。実測で面積が 2.39 倍になった。
  //
  // 正しい手当ては「極で切り開く」こと。経度を巻き戻したリングの末尾に
  // 「極まで降りる → 反対端へ戻る」2 点を足すと、平面上の単純多角形になる。
  // 足した 2 点はどちらも 3D では極そのものに写るので、余分な面は生まれない。
  let ringsForEarcut = rings;
  let closeAtPole = 0;
  if (winding !== 0) {
    const meanLat = outer.reduce((a, c) => a + c[1], 0) / outer.length;
    closeAtPole = meanLat < 0 ? -90 : 90;
    const u = unwrapLon(outer);
    const closed = u.concat([
      [u[u.length - 1][0], closeAtPole],
      [u[0][0], closeAtPole],
    ]);
    closed.winding = 0; // 切り開いたので、もう極を囲んでいない
    ringsForEarcut = [closed, ...rings.slice(1)];
  }

  // 通常のリング。経度を巻き戻してから経緯度平面で earcut にかける。
  // 頂点はそのまま球面へ写るので、分割の位相だけを平面で決めていることになる。
  const outer2 = ringsForEarcut[0];
  const uOuter = closeAtPole ? outer2 : unwrapLon(outer2);
  const lo = uOuter.reduce((a, c) => Math.min(a, c[0]), Infinity);
  const hi = uOuter.reduce((a, c) => Math.max(a, c[0]), -Infinity);

  const flat = [];
  const holeIdx = [];
  const src = [];
  for (const [lon, lat] of uOuter) {
    flat.push(lon, lat);
    src.push([lon, lat]);
  }
  for (let ri = 1; ri < ringsForEarcut.length; ri++) {
    const h = unwrapLon(ringsForEarcut[ri]);
    // 穴を外リングと同じ経度の枝へ寄せる（外リングが ±360 ずれた枝にいる場合の対策）
    const c = h.reduce((a, p) => a + p[0], 0) / h.length;
    let shift = 0;
    while (c + shift < lo) shift += 360;
    while (c + shift > hi) shift -= 360;
    holeIdx.push(flat.length / 2);
    for (const [lon, lat] of h) {
      flat.push(lon + shift, lat);
      src.push([lon + shift, lat]);
    }
  }

  let tri = earcut(flat, holeIdx, 2);
  ({ tri } = refine(src, tri));
  const n = src.length;
  const positions = new Float32Array(n * 3);
  const lonlat = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const v = toVec(src[i][1], src[i][0]);
    positions[i * 3] = v[0];
    positions[i * 3 + 1] = v[1];
    positions[i * 3 + 2] = v[2];
    lonlat[i * 2] = src[i][0];
    lonlat[i * 2 + 1] = src[i][1];
  }
  const indices = Uint32Array.from(tri);
  faceOutward(positions, indices);
  return { positions, indices, lonlat };
}

/** 単位球上の三角形群の面積（ステラジアン）。分割が正しいかの検算用。 */
export function meshArea(positions, indices) {
  let area = 0;
  const v = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  for (let i = 0; i < indices.length; i += 3) {
    const a = v(indices[i]);
    const b = v(indices[i + 1]);
    const c = v(indices[i + 2]);
    // Van Oosterom & Strackee の立体角公式
    const num =
      Math.abs(
        a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])
      );
    const den =
      1 +
      (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) +
      (b[0] * c[0] + b[1] * c[1] + b[2] * c[2]) +
      (a[0] * c[0] + a[1] * c[1] + a[2] * c[2]);
    area += 2 * Math.atan2(num, den);
  }
  return area;
}

/** 三角形の 3 辺のうち最長の弦長（単位球）。長すぎる三角形は地表から浮く。 */
export function maxEdgeChord(positions, indices) {
  let m = 0;
  const d = (i, j) => Math.hypot(positions[i * 3] - positions[j * 3], positions[i * 3 + 1] - positions[j * 3 + 1], positions[i * 3 + 2] - positions[j * 3 + 2]);
  for (let i = 0; i < indices.length; i += 3) {
    m = Math.max(m, d(indices[i], indices[i + 1]), d(indices[i + 1], indices[i + 2]), d(indices[i], indices[i + 2]));
  }
  return m;
}
