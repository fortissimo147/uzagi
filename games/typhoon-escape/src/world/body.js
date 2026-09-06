// 動く陸塊。DESIGN.md §1.8 / §1b.4 / §3.3c。
// プレイヤー（台湾本島）と、押しのけられる他の陸の両方をこれで表す。
// three.js にも rules/ にも依存しない（§0.3）。
import * as S from "./sphere.js";

const BUCKETS = 720; // 経度 0.5 度刻み
const BW = 360 / BUCKETS;

/** 経度差を (-180, 180] に畳む。 */
const dLon = (a) => {
  let d = a;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
};

/**
 * リング群に子午線レイキャスト用の経度バケット索引を張る（§3.3c）。
 * 素朴に全辺を走ると最大リングが 83,725 辺あって毎フレームは回らない。
 */
function buildIndex(rings) {
  // 辺を「型付き配列に平らに並べたもの」にする。リングを [[lon,lat],...] のまま
  // 走るとポインタ追跡だらけで、最大リング（80,983 辺）が毎フレームに間に合わない。
  let m = 0;
  for (const r of rings) m += r.length;
  // 始点は Float64。Float32 だと経度 180 付近で丸めが 2e-5 度になり、
  // レイをずらす RAY_EPS より大きくなって「頂点をちょうど貫く」縮退が復活する。
  const lon0 = new Float64Array(m);
  const lat0 = new Float64Array(m);
  const dLo = new Float32Array(m);
  const dLa = new Float32Array(m);
  const counts = new Int32Array(BUCKETS);
  const spans = new Int32Array(m * 2);
  let e = 0;
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      const b = r[(i + 1) % r.length];
      const d = dLon(b[0] - a[0]);
      if (d === 0) continue;
      lon0[e] = a[0];
      lat0[e] = a[1];
      dLo[e] = d;
      dLa[e] = b[1] - a[1];
      const lo = d > 0 ? a[0] : a[0] + d;
      const n = Math.ceil(Math.abs(d) / BW) + 1;
      const k = Math.floor(((((lo + 180) % 360) + 360) % 360) / BW);
      spans[e * 2] = k;
      spans[e * 2 + 1] = n;
      for (let j = 0; j < n; j++) counts[(k + j) % BUCKETS]++;
      e++;
    }
  }
  const start = new Int32Array(BUCKETS + 1);
  for (let i = 0; i < BUCKETS; i++) start[i + 1] = start[i] + counts[i];
  const items = new Int32Array(start[BUCKETS]);
  const fill = start.slice(0, BUCKETS);
  for (let i = 0; i < e; i++) {
    const k = spans[i * 2];
    const n = spans[i * 2 + 1];
    for (let j = 0; j < n; j++) items[fill[(k + j) % BUCKETS]++] = i;
  }
  return { lon0, lat0, dLo, dLa, start, items };
}

/**
 * 球面多角形の面積（ステラジアン）。Chamberlain & Duquette の式。
 * 「自分より大きい陸は押せない」という判定に使う。
 */
export function ringArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    let d = (x2 - x1) * S.DEG;
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    s += d * (2 + Math.sin(y1 * S.DEG) + Math.sin(y2 * S.DEG));
  }
  return Math.abs(s / 2);
}

/**
 * 陸塊を作る。
 * @param {[number,number][][]} rings 経緯度のリング群（rings[0] が外周）
 */
export function createBody(rings) {
  // 球面の外接キャップ（重心 + 角半径）。当たり判定の早期棄却に使う。
  let c = [0, 0, 0];
  let n = 0;
  for (const r of rings[0]) {
    const v = S.toVec(r[1], r[0]);
    c[0] += v[0];
    c[1] += v[1];
    c[2] += v[2];
    n++;
  }
  S.normalize(c);
  let radius = 0;
  for (const r of rings[0]) radius = Math.max(radius, S.angleDeg(c, S.toVec(r[1], r[0])));
  // 外周の面積から穴を引く。押せる／押せないの判定に使う（§1b.6）。
  let area = ringArea(rings[0]);
  for (let i = 1; i < rings.length; i++) area -= ringArea(rings[i]);

  // 経緯度の bbox。巨大な陸は外接キャップが半球を超えて役に立たないので、
  // 壁の判定ではこちらで粗く弾く（§1b.8）。
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [lon, lat] of rings[0]) {
    if (lon < bbox[0]) bbox[0] = lon;
    if (lat < bbox[1]) bbox[1] = lat;
    if (lon > bbox[2]) bbox[2] = lon;
    if (lat > bbox[3]) bbox[3] = lat;
  }
  // 日付変更線をまたぐ陸は経度で弾けない
  const wrapsLon = bbox[0] <= -179.99 && bbox[2] >= 179.99;

  return {
    rings,
    area, // ステラジアン
    bbox,
    wrapsLon,
    coastCells: null, // 必要になったときに作る（壁になる 43 個しか使わない）
    index: buildIndex(rings),
    center: c, // 元の姿勢での重心
    radius, // 角半径[度]
    q: S.quatIdentity(), // 現在の姿勢
    omega: [0, 0, 0], // 角速度ベクトル（向き=回転軸, 長さ=度/秒）
    moved: false, // 一度でも押されたか（描画側がメッシュを切り出す合図）
    _conj: S.quatIdentity(),
    _centerNow: [c[0], c[1], c[2]],
    _dirty: false,
  };
}

// 姿勢が変わったときだけ再計算するキャッシュ。毎フレーム 4,000 個回るので効く。
function refresh(b) {
  if (b._dirty) {
    b._conj = S.quatConj(b.q);
    S.quatApply(b.q, b.center, b._centerNow);
    b._dirty = false;
  }
}

/**
 * 現在の姿勢での重心。
 * **返る配列は内部キャッシュそのもの**なので、保持したいときは複製すること。
 */
export function bodyCenter(b) {
  refresh(b);
  return b._centerNow;
}

// 判定は「レイが頂点をちょうど貫く」縮退に弱い。日付変更線で切られたポリゴンは
// 経度ちょうど ±180 の頂点を大量に持つので、実際に (0N, 180E) の外洋が陸と誤判定された。
// 量子化ステップ 0.0055 度よりはるかに小さい値だけ子午線をずらして避ける。
const RAY_EPS = 1e-5;

/**
 * 海岸線がどの 1 度セルを通るかの集合を作る（§1b.8）。
 *
 * ユーラシアのように bbox が全球に及ぶ陸は、bbox でも外接キャップでも弾けず、
 * 外洋にいても毎フレーム全点を判定してしまう。海岸線から離れていることが
 * 1 回の判定で分かれば、あとは中心 1 点を見るだけで済む。
 */
export function buildCoastCells(rings) {
  const cells = new Set();
  const key = (lon, lat) => (Math.floor(lat + 90) << 9) | (Math.floor(((lon + 180) % 360 + 360) % 360));
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i];
      const b = r[(i + 1) % r.length];
      cells.add(key(a[0], a[1]));
      // 1 度より長い辺はセルを飛ばしうるので途中も打つ
      let d = b[0] - a[0];
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      const n = Math.ceil(Math.max(Math.abs(d), Math.abs(b[1] - a[1])));
      for (let k = 1; k < n; k++) cells.add(key(a[0] + (d * k) / n, a[1] + ((b[1] - a[1]) * k) / n));
    }
  }
  return cells;
}

/** 経緯度の矩形が海岸線のセルに触れるか。セル集合は初回に作る。 */
export function coastNear(b, lonMin, latMin, lonMax, latMax) {
  if (!b.coastCells) b.coastCells = buildCoastCells(b.rings);
  for (let lat = Math.floor(latMin); lat <= Math.floor(latMax); lat++) {
    for (let lon = Math.floor(lonMin); lon <= Math.floor(lonMax); lon++) {
      const k = ((lat + 90) << 9) | ((((lon + 180) % 360) + 360) % 360);
      if (b.coastCells.has(k)) return true;
    }
  }
  return false;
}

/**
 * 単位ベクトル p が陸塊の内側にあるか。
 * p を陸塊のローカル座標へ戻してから、子午線に沿ったレイキャストで判定する。
 * 極を囲むリング（南極）に対してもそのまま正しく動く。
 */
const SCRATCH = [0, 0, 0];
export function pointInBody(b, p) {
  refresh(b);
  const local = S.quatApply(b._conj, p, SCRATCH);
  const y = local[1] < -1 ? -1 : local[1] > 1 ? 1 : local[1];
  const lat = Math.asin(y) / S.DEG;
  const lon = Math.atan2(local[0], local[2]) / S.DEG + RAY_EPS;
  const k = Math.floor(((((lon + 180) % 360) + 360) % 360) / BW) % BUCKETS;
  const { lon0, lat0, dLo, dLa, start, items } = b.index;
  let inside = false;
  for (let i = start[k], end = start[k + 1]; i < end; i++) {
    const e = items[i];
    let x = lon - lon0[e];
    if (x > 180) x -= 360;
    else if (x <= -180) x += 360;
    const t = x / dLo[e];
    if (t < 0 || t >= 1) continue;
    if (lat0[e] + t * dLa[e] > lat) inside = !inside;
  }
  return inside;
}

/**
 * 経緯度の矩形に重なる辺を集める（§1b.8）。
 *
 * 壁の判定で「点が内側か」を全点について解くと、子午線レイが経度バケットの
 * 全辺（ユーラシアで千本規模）を舐めることになり重い（実測 1.4 ms）。
 * 近傍の辺だけ集めて**辺と辺の交差**を見るほうが速く、しかもすり抜けに強い。
 *
 * 返すのは [lonA, latA, lonB, latB, ...] の平坦な配列。
 * 経度は refLon と同じ枝へ巻き戻してあるので、そのまま平面として扱ってよい。
 */
export function edgesNear(b, refLon, lonMin, latMin, lonMax, latMax, out = []) {
  const { lon0, lat0, dLo, dLa, start, items } = b.index;
  out.length = 0;
  const k0 = Math.floor(((((lonMin + 180) % 360) + 360) % 360) / BW);
  const k1 = Math.floor(((((lonMax + 180) % 360) + 360) % 360) / BW);
  const n = ((k1 - k0 + BUCKETS) % BUCKETS) + 1;
  const seen = new Set();
  for (let j = 0; j < n; j++) {
    const k = (k0 + j) % BUCKETS;
    for (let i = start[k], end = start[k + 1]; i < end; i++) {
      const e = items[i];
      if (seen.has(e)) continue;
      const la = lat0[e];
      const lb = la + dLa[e];
      if (Math.max(la, lb) < latMin || Math.min(la, lb) > latMax) continue;
      let a = lon0[e] - refLon;
      while (a > 180) a -= 360;
      while (a < -180) a += 360;
      const bb = a + dLo[e];
      if (Math.max(a, bb) < lonMin - refLon || Math.min(a, bb) > lonMax - refLon) continue;
      seen.add(e);
      out.push(a + refLon, la, bb + refLon, lb);
    }
  }
  return out;
}

/**
 * プレイヤーの頂点で陸塊を押す。元の pushLand() の球面版（§1.8）。
 * @param {number[][]} pts プレイヤーの海岸線頂点（単位ベクトル）
 * @param {number[]}   playerPos プレイヤーの中心（単位ベクトル）
 * @returns {boolean} 押したか
 */
export function pushBody(b, pts, playerPos, playerRadius, cfg) {
  const bc = bodyCenter(b);
  // acos も cos も避けて内積だけで棄却する。4,000 個を毎フレーム見るので、
  // ここで三角関数を 1 回引くだけでも積み上がる。しきい値は一度だけ計算する。
  if (b._cosReach === undefined) {
    const reach = b.radius + playerRadius + cfg.PUSH_MARGIN;
    b._cosReach = reach >= 180 ? -2 : Math.cos(reach * S.DEG);
  }
  if (bc[0] * playerPos[0] + bc[1] * playerPos[1] + bc[2] * playerPos[2] < b._cosReach) return false;

  const sum = [0, 0, 0];
  let n = 0;
  for (const p of pts) {
    if (!pointInBody(b, p)) continue;
    sum[0] += p[0];
    sum[1] += p[1];
    sum[2] += p[2];
    n++;
  }
  if (!n) return false;

  // 押す向き = プレイヤー中心から見た貫入点の方向。元と同じ。
  S.normalize(sum);
  const axis = S.cross(playerPos, sum);
  const len = Math.hypot(axis[0], axis[1], axis[2]);
  if (len < 1e-9) return false; // 真上に重なっている。向きが決まらない
  b.omega = [(axis[0] / len) * cfg.PUSH_SPD, (axis[1] / len) * cfg.PUSH_SPD, (axis[2] / len) * cfg.PUSH_SPD];
  b.moved = true;
  b._dirty = true;
  return true;
}

/** 慣性で滑らせる。元の slideLand() の球面版。減衰は 0.12^dt でフレームレート非依存。 */
export function slideBody(b, dt, cfg) {
  const w = Math.hypot(b.omega[0], b.omega[1], b.omega[2]);
  if (w === 0) return false;
  const dq = S.quatFromAxisAngle(b.omega, w * dt * S.DEG);
  b.q = S.quatMul(dq, b.q);
  b._dirty = true;
  const k = Math.pow(cfg.SLIDE_DAMP, dt);
  b.omega = [b.omega[0] * k, b.omega[1] * k, b.omega[2] * k];
  if (Math.hypot(b.omega[0], b.omega[1], b.omega[2]) < cfg.SLIDE_CUTOFF) b.omega = [0, 0, 0];
  return true;
}
