// ステージ「みどりの柱の塔」。土台からてっぺんの土管まで、6つの区画を登る縦長構成。
import * as THREE from "three";
import { Collider } from "./physics.js";
import { tex, flat } from "./textures.js";
import { Walker, FireJet, SpikeBall } from "./enemies.js";

const TEX_SCALE = 4; // テクスチャ1タイル＝4ワールド単位

export function buildLevel(scene, world) {
  const solids = new THREE.Group();
  const decor = new THREE.Group();
  const items = new THREE.Group();
  scene.add(solids, decor, items);

  const level = {
    solids,
    decor,
    items,
    coins: [],
    hearts: [],
    movers: [],
    enemies: [],
    checkpoints: [],
    spawn: new THREE.Vector3(0, 0.2, -5),
    goal: null,
    totalCoins: 0,
  };

  // ---------- 生成ヘルパ ----------
  function boxMaterials(texName, w, h, d, tint) {
    const mk = (rx, ry) =>
      new THREE.MeshLambertMaterial({
        map: tex[texName](Math.max(0.25, rx / TEX_SCALE), Math.max(0.25, ry / TEX_SCALE)),
        color: tint ?? 0xffffff,
      });
    return [mk(d, h), mk(d, h), mk(w, d), mk(w, d), mk(w, h), mk(w, h)];
  }

  function solid(cx, cy, cz, w, h, d, texName, opts = {}) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      boxMaterials(texName, w, h, d, opts.tint)
    );
    mesh.position.set(cx, cy, cz);
    mesh.receiveShadow = true;
    solids.add(mesh);
    if (opts.collide !== false) {
      world.add(
        new Collider(
          new THREE.Vector3(cx - w / 2, cy - h / 2, cz - d / 2),
          new THREE.Vector3(cx + w / 2, cy + h / 2, cz + d / 2),
          { mesh, tag: opts.tag }
        )
      );
    }
    return mesh;
  }

  function wedgeGeometry(w, run, lowH, highH) {
    const geo = new THREE.BoxGeometry(w, 1, run);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) > 0) {
        const t = p.getZ(i) / run + 0.5;
        p.setY(i, lowH + t * (highH - lowH));
      } else p.setY(i, 0);
    }
    geo.computeVertexNormals();
    geo.attributes.position.needsUpdate = true;
    return geo;
  }

  /** 坂。axis方向の dir 側へ上る。baseYは体積の底。 */
  function ramp(cx, baseY, cz, w, run, lowH, highH, axis, dir, texName) {
    const mesh = new THREE.Mesh(
      wedgeGeometry(w, run, lowH, highH),
      new THREE.MeshLambertMaterial({
        map: tex[texName](w / TEX_SCALE, run / TEX_SCALE),
      })
    );
    mesh.position.set(cx, baseY, cz);
    mesh.rotation.y =
      axis === "z" ? (dir > 0 ? 0 : Math.PI) : dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    solids.add(mesh);

    const halfW = axis === "z" ? w / 2 : run / 2;
    const halfD = axis === "z" ? run / 2 : w / 2;
    world.add(
      new Collider(
        new THREE.Vector3(cx - halfW, baseY, cz - halfD),
        new THREE.Vector3(cx + halfW, baseY + highH, cz + halfD),
        { kind: "ramp", axis, dir, low: baseY + lowH, mesh }
      )
    );
    return mesh;
  }

  /** 動く床。fromとtoの間を period 秒で往復する。 */
  function mover(size, from, to, period, texName, phase = 0) {
    const [w, h, d] = size;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      boxMaterials(texName, w, h, d)
    );
    solids.add(mesh);
    const collider = world.add(
      new Collider(
        new THREE.Vector3(from[0] - w / 2, from[1] - h / 2, from[2] - d / 2),
        new THREE.Vector3(from[0] + w / 2, from[1] + h / 2, from[2] + d / 2),
        { mesh }
      )
    );
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const half = new THREE.Vector3(w / 2, h / 2, d / 2);
    const m = {
      t: phase * period,
      update(dt) {
        m.t += dt;
        const k = 0.5 - 0.5 * Math.cos((m.t / period) * Math.PI * 2);
        const p = new THREE.Vector3().lerpVectors(a, b, k);
        mesh.position.copy(p);
        collider.setBounds(
          new THREE.Vector3().subVectors(p, half),
          new THREE.Vector3().addVectors(p, half)
        );
      },
    };
    m.update(0);
    level.movers.push(m);
    return m;
  }

  function railing(cx, cy, cz, w, d) {
    const mat = flat(0xc9a227);
    const g = new THREE.Group();
    const postGeo = new THREE.BoxGeometry(0.16, 1.1, 0.16);
    const barGeo = (len, vertical) =>
      new THREE.BoxGeometry(vertical ? 0.1 : len, 0.1, vertical ? len : 0.1);
    for (const [sx, sz] of [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ]) {
      const len = sx === 0 ? w : d;
      const bar = new THREE.Mesh(barGeo(len, sx !== 0), mat);
      bar.position.set((sx * w) / 2, 0.95, (sz * d) / 2);
      g.add(bar);
      const bar2 = bar.clone();
      bar2.position.y = 0.45;
      g.add(bar2);
    }
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const post = new THREE.Mesh(postGeo, mat);
      post.position.set((sx * w) / 2, 0.55, (sz * d) / 2);
      g.add(post);
    }
    g.position.set(cx, cy, cz);
    decor.add(g);
    return g;
  }

  // ---------- アイテム ----------
  const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 14);
  const coinMat = new THREE.MeshLambertMaterial({
    color: 0xffd23f,
    emissive: 0x6b4a00,
  });

  function coin(x, y, z) {
    const m = new THREE.Mesh(coinGeo, coinMat);
    m.rotation.x = Math.PI / 2;
    m.position.set(x, y + 0.9, z);
    items.add(m);
    const c = { mesh: m, pos: m.position, taken: false, phase: Math.random() * 6 };
    level.coins.push(c);
    return c;
  }

  function coinLine(from, to, n) {
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0.5 : i / (n - 1);
      coin(
        from[0] + (to[0] - from[0]) * k,
        from[1] + (to[1] - from[1]) * k,
        from[2] + (to[2] - from[2]) * k
      );
    }
  }

  function heart(x, y, z) {
    const g = new THREE.Group();
    const mat = flat(0xff5a7a, { emissive: 0x4a0010 });
    for (const s of [-1, 1]) {
      const lobe = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat);
      lobe.position.set(0.19 * s, 0.2, 0);
      g.add(lobe);
    }
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.6, 10), mat);
    tip.position.y = -0.18;
    tip.rotation.x = Math.PI;
    g.add(tip);
    g.position.set(x, y + 1.2, z);
    items.add(g);
    const h = { object: g, pos: g.position, taken: false };
    level.hearts.push(h);
    return h;
  }

  function checkpoint(x, y, z, label) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 3, 8),
      flat(0xdedede)
    );
    pole.position.y = 1.5;
    g.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.8),
      new THREE.MeshLambertMaterial({ color: 0x9aa3ad, side: THREE.DoubleSide }));
    flag.position.set(0.72, 2.5, 0);
    g.add(flag);
    g.position.set(x, y, z);
    decor.add(g);
    const cp = {
      object: g,
      flag,
      pos: new THREE.Vector3(x, y, z),
      active: false,
      label,
    };
    level.checkpoints.push(cp);
    return cp;
  }

  // ================= 区画0：スタート広場 =================
  solid(0, -1.5, 0, 20, 3, 20, "cobble");
  // 開始直後にうっかり後ろへ落ちないよう、背面だけは壁にする
  solid(0, 0.9, -9.5, 20, 1.8, 1, "stone", { tint: 0xd6d6cd });
  solid(-9, 1, 0, 2, 2, 20, "stone", { tint: 0xdadad2 });
  solid(9, 1, 0, 2, 2, 20, "stone", { tint: 0xdadad2 });
  // 入口の門柱。カメラがすり抜けて視界を塞がないよう、当たり判定も持たせる。
  for (const s of [-1, 1]) {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1.1, 7, 12),
      new THREE.MeshLambertMaterial({ map: tex.stone(1, 2) })
    );
    col.position.set(s * 6.4, 3.5, 8);
    decor.add(col);
    world.add(
      new Collider(
        new THREE.Vector3(s * 6.4 - 1.05, 0, 8 - 1.05),
        new THREE.Vector3(s * 6.4 + 1.05, 7, 8 + 1.05),
        { mesh: col }
      )
    );
  }
  coinLine([-3, 0.2, 2], [3, 0.2, 2], 3);

  // ================= 区画1：石の坂と火柱 =================
  ramp(0, -3, 15, 9, 12, 3, 8, "z", 1, "stone");
  level.enemies.push(
    new FireJet(new THREE.Vector3(-2.2, 1.75, 12.8), {
      height: 5,
      period: 2.8,
      offset: 0.2,
    }),
    new FireJet(new THREE.Vector3(2.4, 3.6, 17.5), {
      height: 5,
      period: 2.8,
      offset: 1.5,
    })
  );
  coinLine([0, 1.2, 12], [0, 4.2, 19], 4);
  solid(0, 4, 27, 15, 2, 12, "stone");
  railing(0, 5, 27, 15, 12);
  checkpoint(-4, 5, 24, "Stone Plaza");

  // ================= 区画2：木の坂と歩行敵 =================
  ramp(17, 2, 27, 8, 20, 3, 10, "x", 1, "wood");
  coinLine([9, 5.7, 27], [25, 11.3, 27], 6);
  level.enemies.push(
    new SpikeBall(
      world,
      new THREE.Vector3(26, 12.8, 25.6),
      new THREE.Vector3(8.5, 6, 25.6),
      { speed: 7, offset: 0.5 }
    )
  );
  solid(34, 11, 27, 15, 2, 13, "wood");
  railing(34, 12, 27, 15, 13);
  level.enemies.push(
    new Walker(world, new THREE.Vector3(29, 12, 24), new THREE.Vector3(39, 12, 24)),
    new Walker(world, new THREE.Vector3(38, 12, 30), new THREE.Vector3(30, 12, 30), {
      speed: 3,
    })
  );
  heart(34, 12, 30.5);
  checkpoint(29, 12, 31, "Timber Ledge");

  // ================= 区画3：動く床とクリスタル =================
  mover([5, 1, 5], [34, 12.5, 18], [34, 15, 3], 5.5, "crystal");
  coin(34, 13.5, 12);
  coin(34, 14.6, 7);
  solid(34, 15, -6, 16, 2, 14, "crystal");
  for (const [cx, cz, s] of [
    [30, -2, 1.6],
    [38.5, -9, 2.3],
    [31.5, -11, 1.2],
  ]) {
    const cr = new THREE.Mesh(
      new THREE.ConeGeometry(0.7 * s, 2.6 * s, 6),
      new THREE.MeshLambertMaterial({ color: 0x7fd8ff, emissive: 0x123a4d })
    );
    cr.position.set(cx, 16 + 1.3 * s, cz);
    decor.add(cr);
  }
  checkpoint(38, 16, -1, "Crystal Hall");
  coinLine([30, 16.2, -6], [30, 16.2, -11], 2);

  // ================= 区画4：鉄の足場のジャンプ地帯 =================
  solid(22, 17.5, -9, 5, 1, 5, "metal");
  coin(22, 18, -9);
  mover([5, 1, 5], [15.5, 19, -11], [15.5, 22, -11], 4.2, "metal", 0.35);
  solid(9, 21.5, -9, 5, 1, 5, "metal");
  coin(9, 22, -9);
  mover([5, 1, 5], [5, 23.5, -11], [1, 23.5, -11], 3.6, "metal", 0.6);
  solid(-9, 23, -11, 15, 2, 13, "metal");
  railing(-9, 24, -11, 15, 13);
  level.enemies.push(
    new Walker(world, new THREE.Vector3(-13, 24, -8), new THREE.Vector3(-5, 24, -14), {
      speed: 2.8,
    }),
    new FireJet(new THREE.Vector3(-9, 24, -11), { height: 4.5, period: 3.4, offset: 1 })
  );
  heart(-14, 24, -15);
  checkpoint(-4, 24, -7, "Iron Corridor");

  // ================= 区画5：チェッカーの階段 =================
  // 段差はどれも2.0。1段ジャンプ（最高到達点 約2.9）で確実に登れる高さに揃えてある。
  const checkerBlocks = [
    [-9, 25, -21, 5, 2, 5],
    [-4, 26.5, -25, 5, 3, 5],
    [2, 28.5, -23, 5, 3, 5],
  ];
  for (const [x, y, z, w, h, d] of checkerBlocks) {
    solid(x, y, z, w, h, d, "checker");
    coin(x, y + h / 2, z);
  }
  mover([5, 3, 5], [9, 30.5, -20], [9, 30.5, -17], 4.4, "checker", 0.25);
  coin(9, 32.2, -18.5);
  level.enemies.push(
    new Walker(world, new THREE.Vector3(2, 31.5, -24), new THREE.Vector3(2, 31.5, -22), {
      speed: 2,
      chaseRange: 4,
    })
  );

  // ================= 区画6：てっぺんと土管 =================
  const summit = new THREE.Mesh(
    new THREE.CylinderGeometry(9, 9.4, 3, 8),
    new THREE.MeshLambertMaterial({ map: tex.cobble(4, 1) })
  );
  summit.position.set(16, 32.5, -8);
  summit.rotation.y = Math.PI / 8; // 平らな面を軸に合わせる（当たり判定の箱と一致させる）
  solids.add(summit);
  // 八角形を十字に組んだ2つの箱で近似する
  for (const [w, d] of [
    [16.6, 12.6],
    [12.6, 16.6],
  ]) {
    world.add(
      new Collider(
        new THREE.Vector3(16 - w / 2, 31, -8 - d / 2),
        new THREE.Vector3(16 + w / 2, 34, -8 + d / 2),
        { mesh: summit }
      )
    );
  }
  // 縁取り
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(9.1, 0.35, 8, 8),
    flat(0xc9a227)
  );
  rim.rotation.x = Math.PI / 2;
  rim.rotation.z = Math.PI / 8;
  rim.position.set(16, 34, -8);
  decor.add(rim);
  checkpoint(11, 34, -4, "The Summit");
  coinLine([12, 34.2, -12], [20, 34.2, -12], 3);

  // ゴールの土管
  const pipe = new THREE.Group();
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 2.2, 12),
    flat(0x2fa02f)
  );
  barrel.position.y = 1.1;
  pipe.add(barrel);
  const lip = new THREE.Mesh(
    new THREE.CylinderGeometry(1.85, 1.85, 0.7, 12),
    flat(0x37c437)
  );
  lip.position.y = 2.25;
  pipe.add(lip);
  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(1.5, 12),
    flat(0x0c2a0c)
  );
  hole.rotation.x = -Math.PI / 2;
  hole.position.y = 2.61;
  pipe.add(hole);
  pipe.position.set(16, 34, -8);
  decor.add(pipe);
  world.add(
    new Collider(
      new THREE.Vector3(16 - 1.7, 34, -8 - 1.7),
      new THREE.Vector3(16 + 1.7, 36.5, -8 + 1.7),
      { mesh: pipe, tag: "pipe" }
    )
  );
  level.goal = {
    object: pipe,
    pos: new THREE.Vector3(16, 36.5, -8),
    radius: 2.2,
  };

  level.totalCoins = level.coins.length;
  buildBackdrop(scene);
  return level;
}

// 背景：緑の柱が林立する洞窟
function buildBackdrop(scene) {
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(2.2, 2.6, 70, 8, 1, true);
  const mat = new THREE.MeshLambertMaterial({
    map: tex.pillar(2, 8),
    side: THREE.DoubleSide,
  });
  const count = 46;
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const rad = 46 + Math.random() * 55;
    p.set(Math.cos(ang) * rad + 8, 12 + Math.random() * 14, Math.sin(ang) * rad - 4);
    s.set(1 + Math.random(), 1 + Math.random() * 0.6, 1 + Math.random());
    q.identity();
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
  }
  group.add(inst);

  // 遥か下の底
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(140, 24),
    new THREE.MeshLambertMaterial({ color: 0x04231e })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -34;
  group.add(floor);

  scene.add(group);
  return group;
}
