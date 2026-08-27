// 当たり判定（physics.js）の単体テスト。ブラウザ不要でnodeだけで走る。
import * as THREE from "three";
import { World, Collider, moveBody, STEP_HEIGHT } from "../src/physics.js";
import { check, near, section, summary } from "./harness.mjs";

const DT = 1 / 60;

function makeBody(x, y, z) {
  return {
    pos: new THREE.Vector3(x, y, z),
    vel: new THREE.Vector3(),
    radius: 0.55,
    height: 1.5,
    grounded: false,
    ground: null,
    wallNormal: new THREE.Vector3(),
    wallTimer: 0,
  };
}

function simulate(world, body, steps, each) {
  for (let i = 0; i < steps; i++) {
    if (each) each(body, i);
    body.vel.y += -34 * DT;
    moveBody(world, body, DT);
  }
  return body;
}

section("1. 箱の上面と坂の高さ");
{
  const box = new Collider(
    new THREE.Vector3(-2, -1, -2),
    new THREE.Vector3(2, 1, 2)
  );
  near("箱の上面はどこでも max.y", box.topAt(1.5, -1.9), 1);

  // +z方向に上る坂：z=-5 で高さ0、z=5 で高さ4
  const ramp = new Collider(
    new THREE.Vector3(-2, -3, -5),
    new THREE.Vector3(2, 4, 5),
    { kind: "ramp", axis: "z", dir: 1, low: 0 }
  );
  near("坂の低い端", ramp.topAt(0, -5), 0);
  near("坂の中央", ramp.topAt(0, 0), 2);
  near("坂の高い端", ramp.topAt(0, 5), 4);
  near("坂の範囲外は端の高さでクランプ", ramp.topAt(0, 99), 4);

  const rampX = new Collider(
    new THREE.Vector3(-5, -3, -2),
    new THREE.Vector3(5, 4, 2),
    { kind: "ramp", axis: "x", dir: -1, low: 0 }
  );
  near("-x方向に上る坂：x=-5 が高い", rampX.topAt(-5, 0), 4);
  near("-x方向に上る坂：x=+5 が低い", rampX.topAt(5, 0), 0);
}

section("2. 落下と着地");
{
  const w = new World();
  w.addBox(0, -1, 0, 20, 2, 20); // 上面 y=0
  const b = makeBody(0, 6, 0);
  simulate(w, b, 120);
  near("床の上に着地する", b.pos.y, 0, 0.01);
  check("接地フラグが立つ", b.grounded === true);
  near("落下速度が0になる", b.vel.y, 0, 0.001);
}

section("3. 段差");
{
  const w = new World();
  w.addBox(0, -1, 0, 20, 2, 20);
  w.addBox(6, 0.2, 0, 4, 2, 6); // 上面 y=1.2（段差1.2＝登れない高さ）
  w.addBox(-6, -0.8, 0, 4, 2, 6); // 上面 y=0.2（段差0.2＝登れる高さ）

  const low = makeBody(-3, 0, 0);
  simulate(w, low, 45, (b) => b.vel.set(-4, b.vel.y, 0)); // 3ユニット進んで段の上へ
  check(
    `${STEP_HEIGHT}以下の段差は登れる`,
    low.pos.y > 0.15 && low.grounded,
    `y=${low.pos.y.toFixed(2)} grounded=${low.grounded}`
  );

  const high = makeBody(3, 0, 0);
  simulate(w, high, 60, (b) => b.vel.set(6, b.vel.y, 0));
  check(
    "高い段差は壁として止まる",
    high.pos.y < 0.05 && high.pos.x < 4 - high.radius + 0.01,
    `pos=(${high.pos.x.toFixed(2)}, ${high.pos.y.toFixed(2)})`
  );
  check("壁に当たったことを記録する", high.wallTimer > 0);
}

section("4. 坂を登る／降りる");
{
  const w = new World();
  w.addBox(0, -1, -8, 20, 2, 8); // 上面 y=0（z=-12..-4 のふもと）
  w.add(
    new Collider(
      new THREE.Vector3(-3, -3, -4),
      new THREE.Vector3(3, 4, 8),
      { kind: "ramp", axis: "z", dir: 1, low: 0 } // z=-4で0、z=8で4
    )
  );
  const b = makeBody(0, 0.2, -8);
  simulate(w, b, 120, (x) => x.vel.set(0, x.vel.y, 5)); // 2秒で10ユニット→z≈2
  near("坂の途中の高さになる", b.pos.y, 2, 0.35);
  check("坂の上でも接地している", b.grounded === true);

  // 下りで浮かない（吸着）
  let airFrames = 0;
  simulate(w, b, 90, (x) => {
    x.vel.set(0, x.vel.y, -5);
    if (!x.grounded) airFrames++;
  });
  check("坂を降りるとき地面から離れない", airFrames <= 2, `浮いたフレーム=${airFrames}`);
}

section("5. 天井");
{
  const w = new World();
  w.addBox(0, -1, 0, 20, 2, 20); // 床 上面 y=0
  w.addBox(0, 3.6, 0, 6, 1.2, 6); // 天井の下面 y=3.0
  const b = makeBody(0, 0, 0);
  b.vel.y = 14;
  let maxHead = 0;
  simulate(w, b, 90, (x) => {
    maxHead = Math.max(maxHead, x.pos.y + x.height);
  });
  check("頭が天井を突き抜けない", maxHead <= 3.02, `頭の最高点=${maxHead.toFixed(2)}`);
  near("床に戻ってくる", b.pos.y, 0, 0.01);
}

section("6. 動く床に運ばれる");
{
  const w = new World();
  const c = w.addBox(0, -0.5, 0, 6, 1, 6); // 上面 y=0
  const b = makeBody(0, 1, 0);
  simulate(w, b, 30); // まず着地
  check("動く床に乗っている", b.grounded && b.ground === c);

  const startX = b.pos.x;
  for (let i = 0; i < 60; i++) {
    const min = c.min.clone().add(new THREE.Vector3(0.05, 0, 0));
    const max = c.max.clone().add(new THREE.Vector3(0.05, 0, 0));
    c.setBounds(min, max);
    b.vel.y += -34 * DT;
    moveBody(w, b, DT);
  }
  near("床の移動量ぶんプレイヤーも動く", b.pos.x - startX, 3, 0.2);
  check("運ばれている間も接地している", b.grounded === true);
}

section("7. 足元の床を調べる");
{
  const w = new World();
  w.addBox(0, -1, 0, 20, 2, 20); // 上面 0
  w.addBox(0, 2, 0, 4, 2, 4); // 上面 3
  const high = w.groundAt(0, 0, 10);
  near("上にある床のほうを返す", high.y, 3);
  const low = w.groundAt(8, 0, 10);
  near("その位置で一番高い床を返す", low.y, 0);
  const none = w.groundAt(100, 100, 10);
  check("床が無ければ -Infinity", none.y === -Infinity);
}

summary("physics.test.mjs");
