// 当たり判定。地形は「箱」と「坂」の2種類だけで表現する。
// プレイヤーはXZ円＋高さの縦カプセル近似として解決する（N64期の3Dアクションと同じ簡易方式）。
import * as THREE from "three";

export const STEP_HEIGHT = 0.45; // これ以下の段差は登れる
const SNAP = 0.35; // 接地中に地面へ吸着する距離（坂を滑り落ちないため）

export class Collider {
  /**
   * @param {THREE.Vector3} min 体積の最小座標
   * @param {THREE.Vector3} max 体積の最大座標（box は max.y が上面）
   * @param {object} opts kind:'box'|'ramp', axis:'x'|'z', dir:1|-1, low:低い側の上面高さ
   */
  constructor(min, max, opts = {}) {
    this.min = min.clone();
    this.max = max.clone();
    this.kind = opts.kind || "box";
    this.axis = opts.axis || "z";
    this.dir = opts.dir ?? 1;
    this.low = opts.low ?? this.min.y;
    this.solidTop = opts.solidTop !== false; // 上に乗れるか
    this.mesh = opts.mesh || null;
    this.delta = new THREE.Vector3(); // 動く床の1フレーム移動量
    this.tag = opts.tag || null;
  }

  topAt(x, z) {
    if (this.kind === "box") return this.max.y;
    const a = this.axis;
    const lo = a === "x" ? this.min.x : this.min.z;
    const hi = a === "x" ? this.max.x : this.max.z;
    const v = THREE.MathUtils.clamp(a === "x" ? x : z, lo, hi);
    let t = (v - lo) / Math.max(1e-6, hi - lo);
    if (this.dir < 0) t = 1 - t;
    return this.low + t * (this.max.y - this.low);
  }

  // 坂の傾きベクトル（上り方向の水平単位ベクトル）
  slopeInfo() {
    if (this.kind !== "ramp") return null;
    const a = this.axis;
    const run = a === "x" ? this.max.x - this.min.x : this.max.z - this.min.z;
    const rise = this.max.y - this.low;
    return { run, rise, tan: rise / Math.max(1e-6, run) };
  }

  overlapsXZ(x, z, r) {
    return (
      x + r > this.min.x &&
      x - r < this.max.x &&
      z + r > this.min.z &&
      z - r < this.max.z
    );
  }

  setBounds(min, max) {
    this.delta.set(
      (min.x + max.x) / 2 - (this.min.x + this.max.x) / 2,
      (min.y + max.y) / 2 - (this.min.y + this.max.y) / 2,
      (min.z + max.z) / 2 - (this.min.z + this.max.z) / 2
    );
    this.min.copy(min);
    this.max.copy(max);
  }
}

export class World {
  constructor() {
    this.colliders = [];
    this.killY = -30; // これより下は落下死
  }

  add(c) {
    this.colliders.push(c);
    return c;
  }

  addBox(cx, cy, cz, sx, sy, sz, opts = {}) {
    return this.add(
      new Collider(
        new THREE.Vector3(cx - sx / 2, cy - sy / 2, cz - sz / 2),
        new THREE.Vector3(cx + sx / 2, cy + sy / 2, cz + sz / 2),
        opts
      )
    );
  }

  // 指定XZの直下にある一番高い床の高さを返す（影・敵の接地用）
  groundAt(x, z, fromY, r = 0.1) {
    let best = -Infinity;
    let hit = null;
    for (const c of this.colliders) {
      if (!c.solidTop) continue;
      if (!c.overlapsXZ(x, z, r)) continue;
      const top = c.topAt(x, z);
      if (top <= fromY + 0.05 && top > best) {
        best = top;
        hit = c;
      }
    }
    return { y: best, collider: hit };
  }
}

/**
 * プレイヤー（またはそれに準ずる剛体）を1フレーム動かす。
 * body: {pos(足元), vel, radius, height, grounded, ground, wallNormal, wallTimer}
 */
export function moveBody(world, body, dt) {
  const { radius: r, height: h } = body;
  const prevFeetY = body.pos.y;

  // 乗っている床が動いた分だけ一緒に運ぶ
  if (body.grounded && body.ground) body.pos.add(body.ground.delta);

  // --- 水平移動 ---
  body.pos.x += body.vel.x * dt;
  body.pos.z += body.vel.z * dt;
  body.hitWall = false;
  for (let iter = 0; iter < 2; iter++) {
    let pushed = false;
    for (const c of world.colliders) {
      if (!c.overlapsXZ(body.pos.x, body.pos.z, r)) continue;
      const feet = body.pos.y;
      const top = c.topAt(body.pos.x, body.pos.z);
      if (top <= feet + STEP_HEIGHT) continue; // 乗り越えられる高さ
      if (c.min.y >= feet + h) continue; // 頭より上にある

      // 円 vs 矩形の押し出し
      const cx = THREE.MathUtils.clamp(body.pos.x, c.min.x, c.max.x);
      const cz = THREE.MathUtils.clamp(body.pos.z, c.min.z, c.max.z);
      let dx = body.pos.x - cx;
      let dz = body.pos.z - cz;
      let dist = Math.hypot(dx, dz);
      if (dist > r) continue;
      if (dist < 1e-5) {
        // 完全に内側 → 一番近い面へ逃がす
        const dl = body.pos.x - c.min.x;
        const dr = c.max.x - body.pos.x;
        const db = body.pos.z - c.min.z;
        const df = c.max.z - body.pos.z;
        const m = Math.min(dl, dr, db, df);
        if (m === dl) {
          body.pos.x = c.min.x - r;
          body.wallNormal = new THREE.Vector3(-1, 0, 0);
        } else if (m === dr) {
          body.pos.x = c.max.x + r;
          body.wallNormal = new THREE.Vector3(1, 0, 0);
        } else if (m === db) {
          body.pos.z = c.min.z - r;
          body.wallNormal = new THREE.Vector3(0, 0, -1);
        } else {
          body.pos.z = c.max.z + r;
          body.wallNormal = new THREE.Vector3(0, 0, 1);
        }
      } else {
        const nx = dx / dist;
        const nz = dz / dist;
        const push = r - dist;
        body.pos.x += nx * push;
        body.pos.z += nz * push;
        body.wallNormal = new THREE.Vector3(nx, 0, nz);
      }
      // 壁方向の速度を殺す
      const n = body.wallNormal;
      const vn = body.vel.x * n.x + body.vel.z * n.z;
      if (vn < 0) {
        body.vel.x -= n.x * vn;
        body.vel.z -= n.z * vn;
      }
      body.hitWall = true;
      body.wallTimer = 0.12;
      pushed = true;
    }
    if (!pushed) break;
  }

  // --- 垂直移動 ---
  body.pos.y += body.vel.y * dt;
  const wasGrounded = body.grounded;
  body.grounded = false;
  body.ground = null;

  // 天井
  if (body.vel.y > 0) {
    for (const c of world.colliders) {
      if (!c.overlapsXZ(body.pos.x, body.pos.z, r * 0.8)) continue;
      const ceil = c.min.y;
      const top = c.topAt(body.pos.x, body.pos.z);
      if (top <= prevFeetY + STEP_HEIGHT) continue;
      if (prevFeetY + h <= ceil && body.pos.y + h > ceil) {
        body.pos.y = ceil - h;
        body.vel.y = 0;
      }
    }
  }

  // 床
  const reach = wasGrounded && body.vel.y <= 0 ? SNAP : 0;
  let bestTop = -Infinity;
  let bestC = null;
  for (const c of world.colliders) {
    if (!c.solidTop) continue;
    if (!c.overlapsXZ(body.pos.x, body.pos.z, r)) continue;
    const top = c.topAt(body.pos.x, body.pos.z);
    if (top > prevFeetY + STEP_HEIGHT + 0.001) continue; // 頭上の床は無視
    if (body.pos.y - reach <= top && top > bestTop) {
      bestTop = top;
      bestC = c;
    }
  }
  if (bestC && body.vel.y <= 0.001) {
    body.pos.y = bestTop;
    body.vel.y = 0;
    body.grounded = true;
    body.ground = bestC;
  }

  if (body.wallTimer > 0) body.wallTimer -= dt;
  return body;
}
