// 球面座標と大圏移動。DESIGN.md §2。
// 純関数のみ。rules/ にも three.js にも依存しない（§0.3）。

export const R_KM = 6371.0088; // IUGG 平均半径
export const DEG = Math.PI / 180;

/** 緯度経度（度）→ 単位ベクトル。経度0が +Z、北極が +Y。 */
export function toVec(lat, lon, out = [0, 0, 0]) {
  const a = lat * DEG;
  const b = lon * DEG;
  const c = Math.cos(a);
  out[0] = c * Math.sin(b);
  out[1] = Math.sin(a);
  out[2] = c * Math.cos(b);
  return out;
}

/** 単位ベクトル → { lat, lon }（度）。 */
export function toLatLon(p) {
  return { lat: Math.asin(clamp(p[1], -1, 1)) / DEG, lon: Math.atan2(p[0], p[2]) / DEG };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b, out = [0, 0, 0]) => {
  const x = a[1] * b[2] - a[2] * b[1];
  const y = a[2] * b[0] - a[0] * b[2];
  const z = a[0] * b[1] - a[1] * b[0];
  out[0] = x;
  out[1] = y;
  out[2] = z;
  return out;
};
export function normalize(v, out = v) {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  out[0] = v[0] / n;
  out[1] = v[1] / n;
  out[2] = v[2] / n;
  return out;
}

/** 2 つの単位ベクトルの間の角距離（ラジアン）。 */
export const angle = (a, b) => Math.acos(clamp(dot(a, b), -1, 1));
/** 角距離（度）。ゲーム内の距離はすべてこの単位で持つ。 */
export const angleDeg = (a, b) => angle(a, b) / DEG;
/** 角距離 → km。表示用。 */
export const degToKm = (deg) => deg * DEG * R_KM;
export const kmToDeg = (km) => km / (DEG * R_KM);

/**
 * 位置 p と接ベクトル t の直交性を回復する。
 * 毎フレームの浮動小数の蓄積で崩れるので、移動のたびに掛ける。
 */
export function reorthonormalize(p, t) {
  normalize(p);
  const d = dot(p, t);
  t[0] -= p[0] * d;
  t[1] -= p[1] * d;
  t[2] -= p[2] * d;
  normalize(t);
}

/**
 * 大圏に沿って角度 theta（ラジアン）だけ進める。§2.3。
 *   p' =  p cosθ + t sinθ
 *   t' = -p sinθ + t cosθ
 * 正規直交性を保つので、緯度によらず速度が一定で、極も普通に通過できる。
 * p, t を破壊的に更新する。
 */
export function advance(p, t, theta) {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  for (let i = 0; i < 3; i++) {
    const pi = p[i];
    const ti = t[i];
    p[i] = pi * c + ti * s;
    t[i] = -pi * s + ti * c;
  }
  reorthonormalize(p, t);
  return p;
}

/** 接ベクトル t を p 軸まわりに omega（ラジアン）回す。進路の旋回。 */
export function turn(p, t, omega) {
  const c = Math.cos(omega);
  const s = Math.sin(omega);
  const k = cross(p, t); // p ⟂ t なので |k| = 1
  for (let i = 0; i < 3; i++) t[i] = t[i] * c + k[i] * s;
  reorthonormalize(p, t);
  return t;
}

/**
 * 位置 p における接平面の正規直交基底 { east, north }。
 * 極の近傍（|p·ŷ| > 0.999）では東西が定まらないので、
 * 呼び出し側が渡した prevNorth を使って絵が回らないようにする。§5.1 / §6。
 */
const Y_AXIS = [0, 1, 0];
export function tangentBasis(p, prevNorth = null) {
  if (Math.abs(p[1]) > 0.999 && prevNorth) {
    const north = [...prevNorth];
    const d = dot(p, north);
    north[0] -= p[0] * d;
    north[1] -= p[1] * d;
    north[2] -= p[2] * d;
    if (Math.hypot(north[0], north[1], north[2]) > 1e-6) {
      normalize(north);
      return { east: normalize(cross(north, p)), north };
    }
  }
  // north = ŷ を接平面へ射影したもの
  const north = [-p[0] * p[1], 1 - p[1] * p[1], -p[2] * p[1]];
  if (Math.hypot(north[0], north[1], north[2]) < 1e-9) {
    // 真の極。任意の向きを返すしかない。
    return { east: [1, 0, 0], north: [0, 0, p[1] > 0 ? -1 : 1] };
  }
  normalize(north);
  return { east: normalize(cross(north, p)), north };
}

/**
 * p にいる者から見た q の方位角（ラジアン、北を 0、東を +）。
 * 元ゲームの toward() の球面版。
 */
export function bearing(p, q, prevNorth = null) {
  const { east, north } = tangentBasis(p, prevNorth);
  // q を p の接平面へ射影する
  const d = dot(p, q);
  const vx = q[0] - p[0] * d;
  const vy = q[1] - p[1] * d;
  const vz = q[2] - p[2] * d;
  const v = [vx, vy, vz];
  return Math.atan2(dot(v, east), dot(v, north));
}

/** 方位角（北0・東+）から接ベクトルを作る。 */
export function tangentFromBearing(p, ang, prevNorth = null) {
  const { east, north } = tangentBasis(p, prevNorth);
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return normalize([north[0] * c + east[0] * s, north[1] * c + east[1] * s, north[2] * c + east[2] * s]);
}

/** 角度差を (-π, π] に畳む。元ゲームの atan2(sin d, cos d) と同じ。 */
export const wrapAngle = (d) => Math.atan2(Math.sin(d), Math.cos(d));
