// 地球の描画。DESIGN.md §4。画像ファイルは使わず、すべてコード生成する。
import * as THREE from "three";
import { tessellatePolygon } from "../world/tessellate.js";
import { toVec } from "../world/sphere.js";

export const R = 1; // 描画上の地球半径。ゲーム内の距離は「度」で持つ（§2）。

function ringToLine(ring, radius) {
  // リングを閉じた線分列にする。ズームに対して常に鮮鋭な海岸線（§4.1-4）。
  const n = ring.length;
  const pos = new Float32Array(n * 2 * 3);
  for (let i = 0; i < n; i++) {
    const a = toVec(ring[i][1], ring[i][0]);
    const b = toVec(ring[(i + 1) % n][1], ring[(i + 1) % n][0]);
    pos[i * 6] = a[0] * radius;
    pos[i * 6 + 1] = a[1] * radius;
    pos[i * 6 + 2] = a[2] * radius;
    pos[i * 6 + 3] = b[0] * radius;
    pos[i * 6 + 4] = b[1] * radius;
    pos[i * 6 + 5] = b[2] * radius;
  }
  return pos;
}

function scalePositions(src, radius) {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) out[i] = src[i] * radius;
  return out;
}

/** 海。緯度方向に淡いグラデーションを乗せる。 */
// three.js は色を線形空間で扱う。自前シェーダの出力にも sRGB への変換を通さないと、
// #1B2F5E のような濃い色がそのまま暗すぎて（実測でほぼ黒に）出る。
function makeOcean(colors) {
  const geo = new THREE.IcosahedronGeometry(R * 0.999, 5);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uBase: { value: new THREE.Color(colors.ocean) } },
    vertexShader: `varying vec3 vN; void main(){ vN = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform vec3 uBase; varying vec3 vN;
      void main(){
        float band = smoothstep(-1.0, 1.0, vN.y);
        vec3 c = mix(uBase * 0.82, uBase * 1.18, band);
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

/** 大気。BackSide の球にフレネル項を加算合成する（§4.2）。 */
function makeAtmosphere(colors) {
  const geo = new THREE.IcosahedronGeometry(R * 1.06, 4);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(colors.landLine) } },
    vertexShader: `varying vec3 vN; varying vec3 vP;
      void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vP = mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform vec3 uColor; varying vec3 vN; varying vec3 vP;
      void main(){
        float f = pow(clamp(1.0 - abs(dot(normalize(vN), normalize(-vP))), 0.0, 1.0), 3.0);
        gl_FragColor = vec4(uColor * f * 0.55, f);
        #include <colorspace_fragment>
      }`,
  });
  return new THREE.Mesh(geo, mat);
}

/**
 * 陸のメッシュ群。
 *
 * 押されていない陸はすべて恒等変換なので 1 本にまとめる（§4.1b）。
 * body ごとに Mesh を作ると 4,000 ドローコールになって 60fps が出ない。
 * 押された瞬間にその index 範囲だけを抜き出して独立 Mesh にする。
 */
class LandLayer {
  constructor(bodies, polygons, colors) {
    this.bodies = bodies;
    this.group = new THREE.Group();
    this.fillMat = new THREE.MeshBasicMaterial({ color: colors.land });
    this.lineMat = new THREE.LineBasicMaterial({ color: colors.landLine, transparent: true, opacity: 0.85 });
    this.parts = [];

    // 全 body を 1 本のバッファへ詰める
    let vTotal = 0;
    let iTotal = 0;
    let lTotal = 0;
    const tess = polygons.map((p) => {
      const t = tessellatePolygon(p.rings);
      vTotal += t.positions.length / 3;
      iTotal += t.indices.length;
      for (const r of p.rings) lTotal += r.length * 2;
      return t;
    });

    const pos = new Float32Array(vTotal * 3);
    const idx = new Uint32Array(iTotal);
    const lpos = new Float32Array(lTotal * 3);
    let vo = 0;
    let io = 0;
    let lo = 0;
    for (let b = 0; b < tess.length; b++) {
      const t = tess[b];
      const nv = t.positions.length / 3;
      pos.set(scalePositions(t.positions, R), vo * 3);
      for (let i = 0; i < t.indices.length; i++) idx[io + i] = t.indices[i] + vo;
      const lStart = lo;
      for (const r of polygons[b].rings) {
        const seg = ringToLine(r, R * 1.0008);
        lpos.set(seg, lo * 3);
        lo += seg.length / 3;
      }
      this.parts.push({ vo, nv, io, ni: t.indices.length, lo: lStart, nl: lo - lStart, mesh: null, line: null });
      vo += nv;
      io += t.indices.length;
    }

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.staticMesh = new THREE.Mesh(this.geo, this.fillMat);
    this.staticMesh.frustumCulled = false;
    this.group.add(this.staticMesh);

    this.lgeo = new THREE.BufferGeometry();
    this.lgeo.setAttribute("position", new THREE.BufferAttribute(lpos, 3));
    this.staticLine = new THREE.LineSegments(this.lgeo, this.lineMat);
    this.staticLine.frustumCulled = false;
    this.group.add(this.staticLine);

    this.idxArray = idx;
    this.posArray = pos;
    this.lposArray = lpos;
    this.liveCount = iTotal;
    this.geo.setDrawRange(0, iTotal);
    this.lgeo.setDrawRange(0, lTotal);
    this.detached = 0;
  }

  /** 押された body を静的バッチから切り出して独立 Mesh にする。1 body につき 1 回だけ。 */
  detach(i) {
    const part = this.parts[i];
    if (part.mesh) return;

    // 1) 詰める前に自分のぶんを取り出す。part.io / part.lo は常に最新に保たれている。
    const sub = new Uint32Array(part.ni);
    for (let k = 0; k < part.ni; k++) sub[k] = this.idxArray[part.io + k] - part.vo;
    const lseg = this.lposArray.slice(part.lo * 3, (part.lo + part.nl) * 3);

    // 2) 静的バッチから自分の範囲を除く（末尾を前へ詰める）
    this.idxArray.copyWithin(part.io, part.io + part.ni, this.liveCount);
    this.liveCount -= part.ni;
    this.geo.setDrawRange(0, this.liveCount);
    this.geo.index.needsUpdate = true;

    const lLive = this.lgeo.drawRange.count;
    this.lposArray.copyWithin(part.lo * 3, (part.lo + part.nl) * 3, lLive * 3);
    this.lgeo.setDrawRange(0, lLive - part.nl);
    this.lgeo.attributes.position.needsUpdate = true;

    for (const p of this.parts) {
      if (p === part) continue;
      if (p.io > part.io) p.io -= part.ni;
      if (p.lo > part.lo) p.lo -= part.nl;
    }

    // 3) 独立メッシュにする。頂点配列は詰めていないので vo/nv はそのまま使える。
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.posArray.slice(part.vo * 3, (part.vo + part.nv) * 3), 3));
    g.setIndex(new THREE.BufferAttribute(sub, 1));
    part.mesh = new THREE.Mesh(g, this.fillMat);
    part.mesh.frustumCulled = false;
    this.group.add(part.mesh);

    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(lseg, 3));
    part.line = new THREE.LineSegments(lg, this.lineMat);
    part.line.frustumCulled = false;
    this.group.add(part.line);
    this.detached++;
  }

  /**
   * 押された body の姿勢を反映する。
   * 動いた body だけを覚えておく。毎フレーム 4,013 個を走査すると無駄が大きい。
   */
  update() {
    if (!this.movedIdx) this.movedIdx = [];
    if (this.scanCursor === undefined) this.scanCursor = 0;
    // 新しく押された body を拾う。1 フレームに全部見なくてよいので分割して走査する。
    const n = this.bodies.length;
    const chunk = 512;
    for (let k = 0; k < chunk; k++) {
      const i = (this.scanCursor + k) % n;
      const b = this.bodies[i];
      if (b.moved && !this.parts[i].mesh) {
        this.detach(i);
        this.movedIdx.push(i);
      }
    }
    this.scanCursor = (this.scanCursor + chunk) % n;
    for (const i of this.movedIdx) {
      const q = this.bodies[i].q;
      this.parts[i].mesh.quaternion.set(q[0], q[1], q[2], q[3]);
      this.parts[i].line.quaternion.set(q[0], q[1], q[2], q[3]);
    }
  }

  /** リセット時に切り出したメッシュを片付ける。 */
  reset() {
    for (const i of this.movedIdx || []) {
      const p = this.parts[i];
      if (p.mesh) {
        p.mesh.quaternion.set(0, 0, 0, 1);
        p.line.quaternion.set(0, 0, 0, 1);
      }
    }
  }
}

/** プレイヤー（台湾本島）。姿勢クォータニオンだけを毎フレーム更新する。 */
function makePlayer(ring, colors) {
  const t = tessellatePolygon([ring]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(scalePositions(t.positions, R * 1.0004), 3));
  g.setIndex(new THREE.BufferAttribute(t.indices, 1));
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: colors.player }));
  mesh.frustumCulled = false;

  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.BufferAttribute(ringToLine(ring, R * 1.0016), 3));
  const line = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: colors.playerLine }));
  line.frustumCulled = false;

  const obj = new THREE.Group();
  obj.add(mesh, line);
  return obj;
}

export function buildGlobe(scene, { polygons, bodies, playerRing, colors }) {
  const root = new THREE.Group();
  root.add(makeOcean(colors));
  const land = new LandLayer(bodies, polygons, colors);
  root.add(land.group);
  const player = makePlayer(playerRing, colors);
  root.add(player);
  root.add(makeAtmosphere(colors));
  scene.add(root);
  return { root, land, player };
}
