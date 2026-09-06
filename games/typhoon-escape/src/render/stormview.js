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

    this.mOuterFill = fill(colors.stormOuter, 0.5);
    this.mInnerFill = fill(colors.stormInner, 0.75);
    this.mOuterLine = line(colors.stormOuter);
    this.mInnerLine = line(colors.stormInner);
    this.mTrail = line(0xffffff, 0.75);
    this.mDash = line(0xffffff, 0.9);
    this.mForecast = line(0xf04650, 0.7);

    this.outerFill = this.mesh(this.mOuterFill);
    this.innerFill = this.mesh(this.mInnerFill);
    this.outerLine = this.lines(this.mOuterLine);
    this.innerLine = this.lines(this.mInnerLine);
    this.trail = this.lines(this.mTrail);
    this.dash = this.lines(this.mDash);
    this.forecast = this.lines(this.mForecast);
    this.eye = this.lines(new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));
    for (const o of [this.outerFill, this.innerFill, this.outerLine, this.innerLine, this.trail, this.dash, this.forecast, this.eye]) {
      o.frustumCulled = false;
      o.renderOrder = 10;
      this.group.add(o);
    }
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
  }

  /** 元ゲームの draw() の台風部分（§1.7）をそのまま球面へ移す。 */
  update(storms, cfg) {
    const oF = [];
    const iF = [];
    const oL = [];
    const iL = [];
    const tr = [];
    const da = [];
    const fc = [];
    const ey = [];
    for (const st of storms) {
      const lethal = st.r * cfg.LETHAL;
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
        ey.push(Float32Array.from(a));
      }
    }
    this.set(this.outerFill, oF);
    this.set(this.innerFill, iF);
    this.set(this.outerLine, oL);
    this.set(this.innerLine, iL);
    this.set(this.trail, tr);
    this.set(this.dash, da);
    this.set(this.forecast, fc);
    this.set(this.eye, ey);
  }
}

export function buildStormView(scene, colors) {
  const v = new StormView(colors);
  scene.add(v.group);
  return v;
}
