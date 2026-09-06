// 台風の描画。DESIGN.md §4.3。**見た目と当たり判定を一致させる**のが要点。
import * as THREE from "three";
import * as S from "../world/sphere.js";
import { R } from "./globe.js";

const LIFT = 1.002; // 地表からわずかに浮かせて z-fighting を避ける
const SEGMENTS = 96;

/** 中心 c（単位ベクトル）から角半径 deg の小円をなぞる頂点列。 */
function smallCircle(c, deg, segments = SEGMENTS, radius = R * LIFT, dash = 0) {
  const { east, north } = S.tangentBasis(c);
  const a = deg * S.DEG;
  const sa = Math.sin(a);
  const ca = Math.cos(a);
  const pts = [];
  const step = (Math.PI * 2) / segments;
  for (let i = 0; i < segments; i++) {
    if (dash && i % (dash * 2) >= dash) continue;
    for (const k of [0, 1]) {
      const t = (i + k) * step;
      const cs = Math.cos(t) * sa;
      const sn = Math.sin(t) * sa;
      pts.push(
        (c[0] * ca + north[0] * cs + east[0] * sn) * radius,
        (c[1] * ca + north[1] * cs + east[1] * sn) * radius,
        (c[2] * ca + north[2] * cs + east[2] * sn) * radius
      );
    }
  }
  return new Float32Array(pts);
}

/** 塗りつぶした小円（円板）。地表に沿わせる。 */
function diskPositions(c, deg, segments = SEGMENTS, radius = R * LIFT) {
  const { east, north } = S.tangentBasis(c);
  const a = deg * S.DEG;
  const sa = Math.sin(a);
  const ca = Math.cos(a);
  const out = new Float32Array(segments * 9);
  const step = (Math.PI * 2) / segments;
  const at = (t, o) => {
    const cs = Math.cos(t) * sa;
    const sn = Math.sin(t) * sa;
    out[o] = (c[0] * ca + north[0] * cs + east[0] * sn) * radius;
    out[o + 1] = (c[1] * ca + north[1] * cs + east[1] * sn) * radius;
    out[o + 2] = (c[2] * ca + north[2] * cs + east[2] * sn) * radius;
  };
  for (let i = 0; i < segments; i++) {
    out[i * 9] = c[0] * radius;
    out[i * 9 + 1] = c[1] * radius;
    out[i * 9 + 2] = c[2] * radius;
    at(i * step, i * 9 + 3);
    at((i + 1) * step, i * 9 + 6);
  }
  return out;
}

/**
 * 対数螺旋の腕をリボン状の三角形帯にする（§4.3）。
 *
 * 接平面の極座標 (ρ, φ) で螺旋 ρ = eye·e^(b·φ) を引き、
 * 各サンプルで進行方向に直交する向きへ幅ぶん膨らませて帯にする。
 * 球面へは v = c·cosρ + (north·cosφ + east·sinφ)·sinρ で写す。
 *
 * @param {number[]} c   中心（単位ベクトル）
 * @param {number} rDeg  外側半径[度]
 * @param {number} rot   回転位相[rad]
 * @param {number} spin  向き（+1 = 反時計回り＝北半球）
 */
export function spiralArms(c, rDeg, rot, spin, cfg, widthScale = 1, out = []) {
  const { east, north } = S.tangentBasis(c);
  const eye = rDeg * cfg.EYE;
  const b = cfg.SPIRAL_B;
  // eye·e^(b·φmax) = rDeg となる φmax まで巻く
  const phiMax = Math.log(rDeg / eye) / b;
  const SAMPLES = 22;
  const at = (rho, phi, o) => {
    const sr = Math.sin(rho * S.DEG);
    const cr = Math.cos(rho * S.DEG);
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    out[o] = (c[0] * cr + (north[0] * cp + east[0] * sp) * sr) * R * LIFT;
    out[o + 1] = (c[1] * cr + (north[1] * cp + east[1] * sp) * sr) * R * LIFT;
    out[o + 2] = (c[2] * cr + (north[2] * cp + east[2] * sp) * sr) * R * LIFT;
  };
  let o = 0;
  for (let a = 0; a < cfg.ARMS; a++) {
    const base = rot + (a * Math.PI * 2) / cfg.ARMS;
    let prev = null;
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const phi = t * phiMax;
      const rho = eye * Math.exp(b * phi);
      // 幅は根元で細く、中ほどで太く、先で消える
      const w = rDeg * 0.13 * widthScale * Math.sin(Math.PI * t) ** 0.6 * (0.35 + 0.65 * t);
      // 螺旋の接線方向に直交する向きへ ±w。接平面の角度で近似してよい（局所現象）
      const dphi = w / Math.max(rho, 1e-6);
      const ang = base + spin * phi;
      const cur = { rho, lo: ang - dphi, hi: ang + dphi };
      if (prev) {
        // 台形を 2 枚の三角形で埋める
        at(prev.rho, prev.lo, o); o += 3;
        at(prev.rho, prev.hi, o); o += 3;
        at(cur.rho, cur.hi, o); o += 3;
        at(prev.rho, prev.lo, o); o += 3;
        at(cur.rho, cur.hi, o); o += 3;
        at(cur.rho, cur.lo, o); o += 3;
      }
      prev = cur;
    }
  }
  out.length = o;
  return out;
}

/**
 * 円環（帯）。当たり判定の境界を確実に見せるために使う。
 * WebGL では LineBasicMaterial の linewidth が常に 1px 扱いになり、
 * 寄ったときに線が細すぎて「どこまでが致死圏か」が読めなくなる。
 */
function annulusPositions(c, r0Deg, r1Deg, segments = SEGMENTS, radius = R * LIFT) {
  const { east, north } = S.tangentBasis(c);
  const out = new Float32Array(segments * 18);
  const step = (Math.PI * 2) / segments;
  const at = (rho, t, o) => {
    const sr = Math.sin(rho * S.DEG);
    const cr = Math.cos(rho * S.DEG);
    const cp = Math.cos(t);
    const sp = Math.sin(t);
    out[o] = (c[0] * cr + (north[0] * cp + east[0] * sp) * sr) * radius;
    out[o + 1] = (c[1] * cr + (north[1] * cp + east[1] * sp) * sr) * radius;
    out[o + 2] = (c[2] * cr + (north[2] * cp + east[2] * sp) * sr) * radius;
  };
  for (let i = 0; i < segments; i++) {
    const a = i * step;
    const b = (i + 1) * step;
    const o = i * 18;
    at(r0Deg, a, o);
    at(r1Deg, a, o + 3);
    at(r1Deg, b, o + 6);
    at(r0Deg, a, o + 9);
    at(r1Deg, b, o + 12);
    at(r0Deg, b, o + 15);
  }
  return out;
}

/** 大圏に沿った線分列。破線にもできる。 */
function greatCircleLine(a, b, segments = 32, dash = 0, radius = R * LIFT) {
  const ang = S.angle(a, b);
  const t = S.tangentFromBearing(a, S.bearing(a, b));
  const pts = [];
  for (let i = 0; i < segments; i++) {
    if (dash && i % (dash * 2) >= dash) continue;
    for (const k of [0, 1]) {
      const th = (ang * (i + k)) / segments;
      const c = Math.cos(th);
      const s = Math.sin(th);
      pts.push((a[0] * c + t[0] * s) * radius, (a[1] * c + t[1] * s) * radius, (a[2] * c + t[2] * s) * radius);
    }
  }
  return new Float32Array(pts);
}

class StormView {
  constructor(colors) {
    this.group = new THREE.Group();
    const line = (color, opacity = 1) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false });
    const fill = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthTest: false });

    // 渦の雲。判定は赤い内円が持つので、雲は情報を持たない飾り。
    // ただし**見た目の主役は雲**にしたいので、塗りは薄くして雲を上に重ねる。
    this.mCloudSoft = fill(0xffffff, 0.20); // 広く淡い層
    this.mCloudCore = fill(0xffffff, 0.62); // 細く明るい芯
    this.mShield = fill(0xdfe9ff, 0.09);
    this.mEye = fill(colors.space, 0.9);
    this.mLethalBand = fill(colors.stormInner, 0.95); // 致死圏の境界。判定そのものを描く
    this.mOuterBand = fill(colors.stormOuter, 0.8);
    this.mOuterFill = fill(colors.stormOuter, 0.1);
    this.mInnerFill = fill(colors.stormInner, 0.3);
    this.mOuterLine = line(colors.stormOuter);
    this.mInnerLine = line(colors.stormInner);
    this.mTrail = line(0xffffff, 0.75);
    this.mDash = line(0xffffff, 0.9);
    this.mForecast = line(0xf04650, 0.7);

    this.shield = this.mesh(this.mShield);
    this.cloudSoft = this.mesh(this.mCloudSoft);
    this.cloud = this.mesh(this.mCloudCore);
    this.eye = this.mesh(this.mEye);
    this.lethalBand = this.mesh(this.mLethalBand);
    this.outerBand = this.mesh(this.mOuterBand);
    this.outerFill = this.mesh(this.mOuterFill);
    this.innerFill = this.mesh(this.mInnerFill);
    this.outerLine = this.lines(this.mOuterLine);
    this.innerLine = this.lines(this.mInnerLine);
    this.trail = this.lines(this.mTrail);
    this.dash = this.lines(this.mDash);
    this.forecast = this.lines(this.mForecast);
    this.cross = this.lines(new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));
    // 描く順（下から）:
    //   雲の傘 → 外円の淡い塗り → 内円の塗り（当たり判定の告知）
    //   → 渦の腕（淡→芯）→ 眼 → 各種の線
    // 渦を塗りの**上**に置くのが要点。下に敷くと赤い塗りに埋もれて赤い塊に見える。
    const order = [this.shield, this.outerFill, this.innerFill,
                   this.cloudSoft, this.cloud, this.eye,
                   this.outerBand, this.lethalBand,
                   this.outerLine, this.innerLine, this.trail, this.dash, this.forecast, this.cross];
    order.forEach((o, i) => {
      o.frustumCulled = false;
      o.renderOrder = 10 + i;
      this.group.add(o);
    });
  }
  mesh(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
    return new THREE.Mesh(g, mat);
  }
  lines(mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
    return new THREE.LineSegments(g, mat);
  }
  /**
   * 毎フレーム作り直すが、**バッファは使い回す**。
   * 毎回 new Float32Array すると GC が刻んでコマ落ちする。
   * 足りなくなったときだけ倍々で伸ばし、描画は setDrawRange で切る。
   */
  set(obj, arrays) {
    let n = 0;
    for (const a of arrays) n += a.length;
    let attr = obj.geometry.attributes.position;
    if (!attr || attr.array.length < n) {
      const cap = Math.max(n, (attr ? attr.array.length : 256) * 2);
      attr = new THREE.BufferAttribute(new Float32Array(cap), 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      obj.geometry.setAttribute("position", attr);
    }
    let o = 0;
    for (const a of arrays) {
      attr.array.set(a, o);
      o += a.length;
    }
    attr.needsUpdate = true;
    obj.geometry.setDrawRange(0, n / 3);
    // 台風が 1 つも無いときに空のメッシュでドローコールを使わない
    obj.visible = n > 0;
  }

  /** 元ゲームの draw() の台風部分（§1.7）をそのまま球面へ移す。 */
  update(storms, cfg) {
    const sh = [];
    const cs = [];
    const cl = [];
    const ey2 = [];
    const lb = [];
    const ob = [];
    const oF = [];
    const iF = [];
    const oL = [];
    const iL = [];
    const tr = [];
    const da = [];
    const fc = [];
    const cr = [];
    for (const st of storms) {
      const lethal = st.r * cfg.LETHAL;
      const spin = st.p[1] >= 0 ? 1 : -1; // 北半球は反時計回り
      sh.push(diskPositions(st.p, st.r, 48));
      cs.push(Float32Array.from(spiralArms(st.p, st.r, st.rot, spin, cfg, 2.1)));
      cl.push(Float32Array.from(spiralArms(st.p, st.r, st.rot, spin, cfg, 0.85)));
      ey2.push(diskPositions(st.p, st.r * cfg.EYE, 24));
      // 帯の太さは半径に比例させる。どの大きさの台風でも同じ見え方になる。
      lb.push(annulusPositions(st.p, lethal * 0.955, lethal, 72));
      ob.push(annulusPositions(st.p, st.r * 0.975, st.r, 72));
      oF.push(diskPositions(st.p, st.r));
      iF.push(diskPositions(st.p, lethal));
      oL.push(smallCircle(st.p, st.r));
      iL.push(smallCircle(st.p, lethal));

      // 過去進路：節点を大圏で結ぶ
      for (let i = 0; i + 1 < st.trail.length; i++) tr.push(greatCircleLine(st.trail[i], st.trail[i + 1], 8));
      if (st.trail.length) tr.push(greatCircleLine(st.trail[st.trail.length - 1], st.p, 8));

      const f = st.forecast;
      if (f && f.dist > 1e-6) {
        da.push(greatCircleLine(st.p, f.p, 24, 2)); // 中心への破線
        da.push(smallCircle(f.p, f.r * 0.5, 48, R * LIFT, 2)); // 内側の破線円
        fc.push(smallCircle(f.p, f.r, 64)); // 予報円（赤の実線）

        // 現在の致死円と予報円の共通外接線 2 本（元と同じ式を接平面で解く）
        if (f.dist > f.r - lethal) {
          const al = Math.acos(Math.max(-1, Math.min(1, (lethal - f.r) / f.dist)));
          const th = S.bearing(st.p, f.p);
          for (const sg of [-1, 1]) {
            const a2 = th + sg * al;
            const p1 = [...st.p];
            const t1 = S.tangentFromBearing(p1, a2);
            S.advance(p1, t1, lethal * S.DEG);
            const p2 = [...f.p];
            const t2 = S.tangentFromBearing(p2, a2);
            S.advance(p2, t2, f.r * S.DEG);
            fc.push(greatCircleLine(p1, p2, 16));
          }
        }
      }

      // 中心の白い ×
      const { east, north } = S.tangentBasis(st.p);
      const e = Math.max(0.12, st.r * 0.28) * S.DEG;
      for (const [u, v] of [
        [1, 1],
        [1, -1],
      ]) {
        const a = [];
        for (const sg of [-1, 1]) {
          const dx = east[0] * u * sg * e + north[0] * v * sg * e;
          const dy = east[1] * u * sg * e + north[1] * v * sg * e;
          const dz = east[2] * u * sg * e + north[2] * v * sg * e;
          const n = Math.hypot(st.p[0] + dx, st.p[1] + dy, st.p[2] + dz);
          a.push(((st.p[0] + dx) / n) * R * 1.004, ((st.p[1] + dy) / n) * R * 1.004, ((st.p[2] + dz) / n) * R * 1.004);
        }
        cr.push(Float32Array.from(a));
      }
    }
    this.set(this.shield, sh);
    this.set(this.cloudSoft, cs);
    this.set(this.cloud, cl);
    this.set(this.eye, ey2);
    this.set(this.lethalBand, lb);
    this.set(this.outerBand, ob);
    this.set(this.outerFill, oF);
    this.set(this.innerFill, iF);
    this.set(this.outerLine, oL);
    this.set(this.innerLine, iL);
    this.set(this.trail, tr);
    this.set(this.dash, da);
    this.set(this.forecast, fc);
    this.set(this.cross, cr);
  }
}

export function buildStormView(scene, colors) {
  const v = new StormView(colors);
  scene.add(v.group);
  return v;
}
