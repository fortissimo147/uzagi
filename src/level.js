// ステージ。土台からてっぺんの土管まで登る縦長の構成を、舞台を変えて3つ作る。
// 新しいステージを足すときは、いちばん下の STAGES に1つ書き足すだけでよい。
//
// 寸法の決まりごと（player.js の値から出したもの）。
//   1段ジャンプで 2.88 / 2段で 3.86 / 3段で 5.59 上がれる。走ったままの跳び幅は約7。
//   なので段差は 2.0 まで、足場のあいだの隙間は 4.5 までに収めてある。
//   横に動く床は乗っても運んでくれない（当たり判定だけが動く）ので、渡し役は
//   縦に動く床にして、横の床は「通りかかった所へ跳び移る」使い方だけにする。
import * as THREE from "three";
import { Collider } from "./physics.js";
import { tex, flat } from "./textures.js";
import { Walker, FireJet, SpikeBall } from "./enemies.js";

const TEX_SCALE = 4; // テクスチャ1タイル＝4ワールド単位

export function buildLevel(scene, world, stageIndex = 0) {
  const index = Math.max(0, Math.min(stageIndex | 0, STAGES.length - 1));
  const stage = STAGES[index];

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
    stage,
    stageIndex: index,
    stageCount: STAGES.length,
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

  function railing(cx, cy, cz, w, d, color = 0xc9a227) {
    const mat = flat(color);
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

  function enemy(...list) {
    level.enemies.push(...list);
  }

  /** 当たり判定だけを足す（見た目を自分で組んだときに使う） */
  function collide(min, max, opts) {
    return world.add(
      new Collider(new THREE.Vector3(...min), new THREE.Vector3(...max), opts)
    );
  }

  function addDecor(mesh) {
    decor.add(mesh);
    return mesh;
  }

  /**
   * てっぺんの八角形の台。topY が足を置く高さになる。
   * 見た目は八角柱、当たり判定は十字に組んだ2つの箱で近似する。
   */
  function summit(cx, topY, cz, texName, rimColor = 0xc9a227) {
    const cy = topY - 1.5;
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(9, 9.4, 3, 8),
      new THREE.MeshLambertMaterial({ map: tex[texName](4, 1) })
    );
    mesh.position.set(cx, cy, cz);
    mesh.rotation.y = Math.PI / 8; // 平らな面を軸に合わせる（当たり判定の箱と一致させる）
    solids.add(mesh);
    for (const [w, d] of [
      [16.6, 12.6],
      [12.6, 16.6],
    ]) {
      collide([cx - w / 2, topY - 3, cz - d / 2], [cx + w / 2, topY, cz + d / 2], { mesh });
    }
    const rim = new THREE.Mesh(new THREE.TorusGeometry(9.1, 0.35, 8, 8), flat(rimColor));
    rim.rotation.x = Math.PI / 2;
    rim.rotation.z = Math.PI / 8;
    rim.position.set(cx, topY, cz);
    addDecor(rim);
    return mesh;
  }

  /** ゴールの土管。baseY は土管の足元＝台の上面。 */
  function goalPipe(cx, baseY, cz) {
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
    const hole = new THREE.Mesh(new THREE.CircleGeometry(1.5, 12), flat(0x0c2a0c));
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 2.61;
    pipe.add(hole);
    pipe.position.set(cx, baseY, cz);
    addDecor(pipe);
    collide([cx - 1.7, baseY, cz - 1.7], [cx + 1.7, baseY + 2.5, cz + 1.7], {
      mesh: pipe,
      tag: "pipe",
    });
    level.goal = {
      object: pipe,
      pos: new THREE.Vector3(cx, baseY + 2.5, cz),
      radius: 2.2,
    };
    return pipe;
  }

  /**
   * どのステージも同じ形の入口。うっかり落ちないよう、出口以外の三方を壁にする。
   * exit は出口の向き（"z" なら +z、"x" なら +x）。ここを塞ぐと先へ進めなくなる。
   */
  function startYard(size, wallTex, opts = {}) {
    const half = size / 2;
    const exit = opts.exit ?? "z";
    solid(0, -1.5, 0, size, 3, size, opts.floorTex ?? wallTex);
    const wall = (cx, cz, w, d) => solid(cx, 1, cz, w, 2, d, wallTex, { tint: opts.tint });
    wall(0, -half + 1, size, 2); // 背面（-z）はどちらの向きでも塞ぐ
    wall(-half + 1, 0, 2, size); // 左（-x）も同じ
    if (exit === "x") wall(0, half - 1, size, 2); // +x が出口なら +z を塞ぐ
    else wall(half - 1, 0, 2, size); // +z が出口なら +x を塞ぐ
  }

  const b = {
    solid,
    ramp,
    mover,
    railing,
    coin,
    coinLine,
    heart,
    checkpoint,
    enemy,
    collide,
    decor: addDecor,
    summit,
    goalPipe,
    startYard,
    world,
    level,
    THREE,
    tex,
    flat,
    Walker,
    FireJet,
    SpikeBall,
  };

  stage.build(b);

  level.totalCoins = level.coins.length;
  applyTheme(scene, stage.theme);
  buildBackdrop(scene, stage.theme);
  return level;
}

export function stageInfo(i) {
  return STAGES[Math.max(0, Math.min(i | 0, STAGES.length - 1))];
}

export const STAGE_COUNT = () => STAGES.length;

// ---------- 舞台まわり（空の色・光・背景） ----------
function applyTheme(scene, t) {
  scene.background = new THREE.Color(t.bg);
  scene.fog = new THREE.Fog(t.fog[0], t.fog[1], t.fog[2]);
  scene.add(new THREE.HemisphereLight(t.hemi[0], t.hemi[1], t.hemi[2]));
  const sun = new THREE.DirectionalLight(t.sun[0], t.sun[1]);
  sun.position.set(...t.sun[2]);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(t.fill[0], t.fill[1]);
  fill.position.set(...t.fill[2]);
  scene.add(fill);
}

// 背景：柱が林立する洞窟。ステージごとに柱の見た目と位置を変える。
function buildBackdrop(scene, t) {
  const d = t.backdrop;
  const group = new THREE.Group();
  const geo = new THREE.CylinderGeometry(d.radius, d.radius * 1.18, d.height, 8, 1, true);
  const mat = new THREE.MeshLambertMaterial({
    map: tex[d.tex](2, 8),
    color: d.tint ?? 0xffffff,
    side: THREE.DoubleSide,
  });
  const count = d.count;
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const rad = d.near + Math.random() * (d.far - d.near);
    p.set(
      Math.cos(ang) * rad + d.center[0],
      d.baseY + Math.random() * 14,
      Math.sin(ang) * rad + d.center[1]
    );
    s.set(1 + Math.random(), 1 + Math.random() * 0.6, 1 + Math.random());
    q.identity();
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
  }
  group.add(inst);

  // 遥か下の底
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(160, 24),
    new THREE.MeshLambertMaterial({ color: d.floor })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(d.center[0], d.floorY, d.center[1]);
  group.add(floor);

  scene.add(group);
  return group;
}

// ================================================================
// ステージ1：みどりの柱の塔
// ================================================================
function stage1(b) {
  const { solid, ramp, mover, railing, coin, coinLine, heart, checkpoint, enemy } = b;
  const { world, level, THREE } = b;

  // ---- 区画0：スタート広場 ----
  solid(0, -1.5, 0, 20, 3, 20, "cobble");
  // 開始直後にうっかり後ろへ落ちないよう、背面だけは壁にする
  solid(0, 0.9, -9.5, 20, 1.8, 1, "stone", { tint: 0xd6d6cd });
  solid(-9, 1, 0, 2, 2, 20, "stone", { tint: 0xdadad2 });
  solid(9, 1, 0, 2, 2, 20, "stone", { tint: 0xdadad2 });
  // 入口の門柱。カメラがすり抜けて視界を塞がないよう、当たり判定も持たせる。
  for (const s of [-1, 1]) {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(1, 1.1, 7, 12),
      new THREE.MeshLambertMaterial({ map: b.tex.stone(1, 2) })
    );
    col.position.set(s * 6.4, 3.5, 8);
    b.decor(col);
    b.collide([s * 6.4 - 1.05, 0, 8 - 1.05], [s * 6.4 + 1.05, 7, 8 + 1.05], { mesh: col });
  }
  coinLine([-3, 0.2, 2], [3, 0.2, 2], 3);

  // ---- 区画1：石の坂と火柱 ----
  ramp(0, -3, 15, 9, 12, 3, 8, "z", 1, "stone");
  enemy(
    new b.FireJet(new THREE.Vector3(-2.2, 1.75, 12.8), {
      height: 5,
      period: 2.8,
      offset: 0.2,
    }),
    new b.FireJet(new THREE.Vector3(2.4, 3.6, 17.5), {
      height: 5,
      period: 2.8,
      offset: 1.5,
    })
  );
  coinLine([0, 1.2, 12], [0, 4.2, 19], 4);
  solid(0, 4, 27, 15, 2, 12, "stone");
  railing(0, 5, 27, 15, 12);
  checkpoint(-4, 5, 24, "Stone Plaza");

  // ---- 区画2：木の坂と歩行敵 ----
  ramp(17, 2, 27, 8, 20, 3, 10, "x", 1, "wood");
  coinLine([9, 5.7, 27], [25, 11.3, 27], 6);
  enemy(
    new b.SpikeBall(
      world,
      new THREE.Vector3(26, 12.8, 25.6),
      new THREE.Vector3(8.5, 6, 25.6),
      { speed: 7, offset: 0.5 }
    )
  );
  solid(34, 11, 27, 15, 2, 13, "wood");
  railing(34, 12, 27, 15, 13);
  enemy(
    new b.Walker(world, new THREE.Vector3(29, 12, 24), new THREE.Vector3(39, 12, 24)),
    new b.Walker(world, new THREE.Vector3(38, 12, 30), new THREE.Vector3(30, 12, 30), {
      speed: 3,
    })
  );
  heart(34, 12, 30.5);
  checkpoint(29, 12, 31, "Timber Ledge");

  // ---- 区画3：動く床とクリスタル ----
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
    b.decor(cr);
  }
  checkpoint(38, 16, -1, "Crystal Hall");
  coinLine([30, 16.2, -6], [30, 16.2, -11], 2);

  // ---- 区画4：鉄の足場のジャンプ地帯 ----
  solid(22, 17.5, -9, 5, 1, 5, "metal");
  coin(22, 18, -9);
  mover([5, 1, 5], [15.5, 19, -11], [15.5, 22, -11], 4.2, "metal", 0.35);
  solid(9, 21.5, -9, 5, 1, 5, "metal");
  coin(9, 22, -9);
  mover([5, 1, 5], [5, 23.5, -11], [1, 23.5, -11], 3.6, "metal", 0.6);
  solid(-9, 23, -11, 15, 2, 13, "metal");
  railing(-9, 24, -11, 15, 13);
  enemy(
    new b.Walker(world, new THREE.Vector3(-13, 24, -8), new THREE.Vector3(-5, 24, -14), {
      speed: 2.8,
    }),
    new b.FireJet(new THREE.Vector3(-9, 24, -11), { height: 4.5, period: 3.4, offset: 1 })
  );
  heart(-14, 24, -15);
  checkpoint(-4, 24, -7, "Iron Corridor");

  // ---- 区画5：チェッカーの階段 ----
  // 段差はどれも2.0。1段ジャンプ（最高到達点 約2.9）で確実に登れる高さに揃えてある。
  for (const [x, y, z, w, h, d] of [
    [-9, 25, -21, 5, 2, 5],
    [-4, 26.5, -25, 5, 3, 5],
    [2, 28.5, -23, 5, 3, 5],
  ]) {
    solid(x, y, z, w, h, d, "checker");
    coin(x, y + h / 2, z);
  }
  mover([5, 3, 5], [9, 30.5, -20], [9, 30.5, -17], 4.4, "checker", 0.25);
  coin(9, 32.2, -18.5);
  enemy(
    new b.Walker(world, new THREE.Vector3(2, 31.5, -24), new THREE.Vector3(2, 31.5, -22), {
      speed: 2,
      chaseRange: 4,
    })
  );

  // ---- 区画6：てっぺんと土管 ----
  b.summit(16, 34, -8, "cobble");
  checkpoint(11, 34, -4, "The Summit");
  coinLine([12, 34.2, -12], [20, 34.2, -12], 3);
  b.goalPipe(16, 34, -8);
}

// ================================================================
// ステージ2：溶けた鉄の工房
//   1が「登る」だけだったので、こちらは横に長く走らせてから登らせる。
//   火柱を増やして、足を止めると焼かれる場面を多くしてある。
// ================================================================
function stage2(b) {
  const { solid, ramp, mover, railing, coin, coinLine, heart, checkpoint, enemy } = b;
  const { world, THREE } = b;

  // ---- 区画0：出口の広場（上面 y=0） ----
  b.startYard(20, "metal", { floorTex: "brick", tint: 0xd8b49a, exit: "x" });
  coinLine([-3, 0.2, 2], [3, 0.2, 2], 3);

  // ---- 区画1：火の廊下（平ら。走り抜ける） ----
  solid(16, -0.5, 0, 12, 1, 10, "metal"); // 上面 y=0、x 10〜22
  enemy(
    new b.FireJet(new THREE.Vector3(13, 0, 0), { height: 5, period: 2.6, offset: 0.3 }),
    new b.FireJet(new THREE.Vector3(19, 0, 0), { height: 5, period: 2.6, offset: 1.6 })
  );
  coinLine([12, 0.2, 0], [20, 0.2, 0], 4);
  solid(30, 0.5, 0, 10, 1, 10, "brick"); // 上面 y=1、x 25〜35（隙間3）
  railing(30, 1, 0, 10, 10, 0xd88a3a);
  checkpoint(30, 1, 3, "Foundry Gate");

  // ---- 区画2：鉄の坂と鉄球 ----
  ramp(42, -2, 0, 9, 14, 3, 9, "x", 1, "metal"); // x 35〜49、y 1→7
  coinLine([36, 1.6, 0], [48, 7.2, 0], 5);
  enemy(
    new b.SpikeBall(
      world,
      new THREE.Vector3(48, 9, -3),
      new THREE.Vector3(62, 9, -3),
      { speed: 7, offset: 0.4 }
    )
  );
  solid(56, 6, 0, 14, 2, 12, "brick"); // 上面 y=7、x 49〜63
  railing(56, 7, 0, 14, 12, 0xd88a3a);
  enemy(
    new b.Walker(world, new THREE.Vector3(51, 7, 4), new THREE.Vector3(61, 7, 4), {
      speed: 3,
    })
  );
  heart(56, 7, 4.5);
  checkpoint(52, 7, -4, "Molten Walk");

  // ---- 区画3：溶鉱炉の昇降機（縦に動く床で持ち上がる） ----
  mover([5, 1, 5], [68, 8, 0], [68, 15, 0], 5.0, "metal"); // 上面 8.5→15.5
  coin(68, 10, 0);
  coin(68, 13, 0);
  solid(78, 14.5, 0, 12, 2, 12, "brick"); // 上面 y=15.5、x 72〜84
  railing(78, 15.5, 0, 12, 12, 0xd88a3a);
  checkpoint(78, 15.5, 4, "High Gantry");

  // ---- 区画4：火柱の飛び石（1段ずつ上がる） ----
  for (const [z, y] of [
    [-11, 16],
    [-18, 17.5],
    [-25, 19],
  ]) {
    solid(78, y, z, 5, 1, 5, "metal");
    coin(78, y + 0.5, z);
  }
  enemy(
    new b.FireJet(new THREE.Vector3(78, 16.5, -11), {
      height: 4.5,
      period: 3.2,
      offset: 0.4,
    }),
    new b.FireJet(new THREE.Vector3(78, 19.5, -25), {
      height: 4.5,
      period: 3.2,
      offset: 1.8,
    })
  );
  solid(78, 20, -34, 14, 2, 12, "brick"); // 上面 y=21、z -40〜-28
  railing(78, 21, -34, 14, 12, 0xd88a3a);
  enemy(
    new b.Walker(world, new THREE.Vector3(73, 21, -32), new THREE.Vector3(83, 21, -32), {
      speed: 2.8,
    })
  );
  heart(78, 21, -38);
  checkpoint(74, 21, -31, "Cooling Deck");

  // ---- 区画5：型枠の階段（段差はどれも2.0） ----
  for (const [x, y, z] of [
    [70, 22, -42], // 上面 23
    [64, 24, -45], // 上面 25
    [58, 26, -42], // 上面 27
  ]) {
    solid(x, y, z, 5, 2, 5, "checker");
    coin(x, y + 1, z);
  }
  enemy(
    new b.Walker(world, new THREE.Vector3(58, 27.5, -43), new THREE.Vector3(58, 27.5, -41), {
      speed: 2,
      chaseRange: 4,
    })
  );
  mover([5, 2, 5], [52, 26, -35], [52, 28, -35], 4.4, "checker", 0.3); // 上面 27→29

  // ---- 区画6：てっぺんと土管 ----
  b.summit(44, 30, -30, "brick", 0xd88a3a);
  checkpoint(39, 30, -26, "The Cupola");
  coinLine([40, 30.2, -34], [48, 30.2, -34], 3);
  b.goalPipe(44, 30, -30);
}

// ================================================================
// ステージ3：凍てついた尖塔
//   最後なので足場を小さくして、動く床と細かい跳び移りを多くする。
//   火柱は出さず、鉄球と歩行敵で追い立てる。
// ================================================================
function stage3(b) {
  const { solid, ramp, mover, railing, coin, coinLine, heart, checkpoint, enemy } = b;
  const { world, THREE } = b;

  // ---- 区画0：氷の踊り場（上面 y=0） ----
  b.startYard(16, "checker", { floorTex: "crystal", tint: 0xbfe4f5 });
  coinLine([-3, 0.2, 2], [3, 0.2, 2], 3);

  // ---- 区画1：氷の坂と横切る鉄球 ----
  ramp(0, -3, 13, 8, 10, 3, 7, "z", 1, "crystal"); // z 8〜18、y 0→4
  enemy(
    new b.SpikeBall(
      world,
      new THREE.Vector3(-5, 3, 13),
      new THREE.Vector3(5, 3, 13),
      { speed: 6, offset: 0.3 }
    )
  );
  coinLine([0, 0.8, 10], [0, 4.2, 17], 4);
  solid(0, 3, 24, 12, 2, 12, "crystal"); // 上面 y=4、z 18〜30
  railing(0, 4, 24, 12, 12, 0x8fd8ff);
  checkpoint(-4, 4, 21, "Frost Landing");

  // ---- 区画2：氷瀑の昇降機 ----
  mover([5, 1, 5], [0, 5, 32], [0, 9, 32], 4.6, "checker"); // 上面 5.5→9.5
  coin(0, 7, 32);
  solid(0, 9.5, 42, 10, 2, 10, "crystal"); // 上面 y=10.5、z 37〜47
  railing(0, 10.5, 42, 10, 10, 0x8fd8ff);
  enemy(
    new b.Walker(world, new THREE.Vector3(-4, 10.5, 44), new THREE.Vector3(4, 10.5, 44), {
      speed: 3,
    })
  );
  heart(0, 10.5, 46);
  checkpoint(-3, 10.5, 39, "Icefall Ledge");

  // ---- 区画3：尖塔をぐるりと登る（小さい足場と縦の動く床） ----
  solid(11, 11.5, 42, 5, 1, 5, "checker"); // 上面 12、x 8.5〜13.5
  coin(11, 12, 42);
  mover([5, 1, 5], [18, 13, 42], [18, 16, 42], 4.0, "checker", 0.3); // 上面 13.5→16.5
  solid(25, 16, 42, 5, 1, 5, "checker"); // 上面 16.5
  coin(25, 16.5, 42);
  mover([5, 1, 5], [25, 17, 35], [25, 19, 35], 4.4, "checker", 0.5); // 上面 17.5→19.5
  solid(25, 19, 25, 12, 2, 12, "crystal"); // 上面 y=20、z 19〜31
  railing(25, 20, 25, 12, 12, 0x8fd8ff);
  enemy(
    new b.SpikeBall(
      world,
      new THREE.Vector3(20, 21.5, 25),
      new THREE.Vector3(30, 21.5, 25),
      { speed: 6.5, offset: 0.8 }
    )
  );
  heart(25, 20, 29);
  checkpoint(21, 20, 21, "Glacier Deck");

  // ---- 区画4：氷柱の階段（段差はどれも2.0） ----
  for (const [z, y] of [
    [14, 21],
    [7, 23],
    [0, 25],
  ]) {
    solid(25, y, z, 5, 2, 5, "checker");
    coin(25, y + 1, z);
  }
  enemy(
    new b.Walker(world, new THREE.Vector3(25, 26, 1), new THREE.Vector3(25, 26, -1), {
      speed: 2,
      chaseRange: 4,
    })
  );

  // ---- 区画5：最後の昇降機 ----
  mover([5, 2, 5], [17, 25, -6], [17, 27, -6], 4.0, "checker", 0.25); // 上面 26→28

  // ---- 区画6：てっぺんと土管 ----
  b.summit(4, 28, -10, "crystal", 0x8fd8ff);
  checkpoint(0, 28, -6, "The Spire");
  coinLine([0, 28.2, -14], [8, 28.2, -14], 3);
  b.goalPipe(4, 28, -10);
}

// ================================================================
// ステージ一覧。ここに足せばそのまま続きの面になる。
// ================================================================
const STAGES = [
  {
    id: "green",
    startArea: "Start Plaza",
    name: "Tower of Green Pillars",
    subtitle: "Climb to the pipe at the summit",
    build: stage1,
    theme: {
      bg: 0x06251f,
      fog: [0x06251f, 45, 175],
      hemi: [0xf2fbf7, 0x274b45, 0.78],
      sun: [0xfff6e2, 1.15, [24, 60, 18]],
      fill: [0x9de8d8, 0.32, [-30, 14, -25]],
      backdrop: {
        tex: "pillar",
        count: 46,
        center: [8, -4],
        near: 46,
        far: 101,
        radius: 2.2,
        height: 70,
        baseY: 12,
        floor: 0x04231e,
        floorY: -34,
      },
    },
  },
  {
    id: "forge",
    startArea: "Furnace Door",
    name: "Molten Ironworks",
    subtitle: "Run the furnace floor, then ride it up",
    build: stage2,
    theme: {
      bg: 0x2a0d08,
      fog: [0x3a1109, 40, 170],
      hemi: [0xffd9b0, 0x3a1810, 0.72],
      sun: [0xffb066, 1.25, [60, 70, 30]],
      fill: [0xff7a3a, 0.4, [-20, 16, -40]],
      backdrop: {
        tex: "brick",
        count: 42,
        center: [40, -12],
        near: 52,
        far: 108,
        radius: 2.6,
        height: 74,
        baseY: 14,
        tint: 0x9c6a52,
        floor: 0x5c1707,
        floorY: -30,
      },
    },
  },
  {
    id: "spire",
    startArea: "Ice Landing",
    name: "Frozen Spire",
    subtitle: "Small footholds all the way to the top",
    build: stage3,
    theme: {
      bg: 0x0a1e2e,
      fog: [0x123048, 38, 165],
      hemi: [0xe8f7ff, 0x22415c, 0.85],
      sun: [0xdfefff, 1.2, [-30, 65, 40]],
      fill: [0x7fd8ff, 0.36, [40, 16, -30]],
      backdrop: {
        tex: "crystal",
        count: 44,
        center: [12, 14],
        near: 48,
        far: 104,
        radius: 2.4,
        height: 72,
        baseY: 10,
        tint: 0xbfe4f5,
        floor: 0x07202f,
        floorY: -32,
      },
    },
  },
];
