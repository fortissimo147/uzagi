import * as THREE from "three";

// Three.js の基本形状だけで組み立てる、実装用ローポリキャラクター。
// 全高は約 1.5。顔は +Z 方向を向く。
//
// rabbit.js と同じものを返す（group / body / face / ears / arms / feet / tail / rest）。
// ears は「左右の毛先」、tail は player.js の既存インターフェースを保つための
// 空オブジェクトとして扱う。

const C = {
  skin: 0xf1d6c2,
  skinShadow: 0xd5ac91,
  hair: 0x402a20,
  hairDark: 0x2d1c17,
  eye: 0x4a2b1b,
  ink: 0x251812,
  white: 0xf4f1e8,
  black: 0x111216,
  gold: 0xb48a24,
  blush: 0xee8f86,
};

// 洞窟の照明は暗く緑がかっているので、そのままの色だと全体がくすんで
// 暗く見える（rabbit.js や、このファイルの前の版と同じ理由）。
// 反射率を1より大きくして底上げする。MeshStandardMaterial は
// MeshLambertMaterial（rabbit.js が使っているもの）より粗さの分だけ
// 暗く出るので、rabbit.js の CREAM_RGB（2.3〜2.7）よりさらに強めに
// 底上げしたうえ、わずかに自発光も足して白がきちんと白く見えるようにする。
const LIGHT_BOOST = 3.1;

function material(color, options = {}) {
  const c = new THREE.Color(color).multiplyScalar(LIGHT_BOOST);
  const e = new THREE.Color(color).multiplyScalar(0.35);
  return new THREE.MeshStandardMaterial({
    color: c,
    emissive: e,
    roughness: 0.88,
    metalness: 0,
    flatShading: true,
    ...options,
  });
}

function basic(color, options = {}) {
  return new THREE.MeshBasicMaterial({ color, ...options });
}

function ellipsoid(rx, ry, rz, color, segments = 12, rings = 8) {
  const geometry = new THREE.SphereGeometry(1, segments, rings);
  geometry.scale(rx, ry, rz);
  return new THREE.Mesh(geometry, material(color));
}

function tube(points, radius, color) {
  const curve = new THREE.CatmullRomCurve3(
    points.map(([x, y, z]) => new THREE.Vector3(x, y, z))
  );
  return new THREE.Mesh(
    new THREE.TubeGeometry(curve, 10, radius, 5, false),
    basic(color)
  );
}

function addEye(parent, x) {
  const eye = new THREE.Group();
  eye.position.set(x, 1.225, 0.267);

  // 白目は大きくしすぎず、横長のアーモンド形にする。
  const white = ellipsoid(0.052, 0.033, 0.010, 0xfffbf2, 12, 8);
  eye.add(white);

  const iris = ellipsoid(0.025, 0.029, 0.008, C.eye, 10, 8);
  iris.position.z = 0.012;
  eye.add(iris);

  const pupil = ellipsoid(0.011, 0.017, 0.006, C.ink, 8, 6);
  pupil.position.z = 0.020;
  eye.add(pupil);

  const glint = ellipsoid(0.0055, 0.0055, 0.003, 0xffffff, 8, 6);
  glint.position.set(-0.007, 0.009, 0.025);
  eye.add(glint);

  parent.add(eye);
  return eye;
}

function addFace(parent) {
  const face = new THREE.Group();

  addEye(face, -0.092);
  addEye(face, 0.092);

  // 眉は目から離しすぎず、内側をわずかに高くする。
  for (const side of [-1, 1]) {
    const brow = tube(
      [
        [0.047 * side, 1.292, 0.271],
        [0.091 * side, 1.307, 0.263],
        [0.137 * side, 1.291, 0.250],
      ],
      0.006,
      C.hairDark
    );
    face.add(brow);
  }

  // 鼻は主張させず、小さな陰影だけを置く。
  const nose = ellipsoid(0.012, 0.009, 0.007, C.skinShadow, 8, 6);
  nose.position.set(0, 1.158, 0.286);
  face.add(nose);

  // 横に広げず、短い閉じ口の微笑みにする。
  const mouth = tube(
    [
      [-0.043, 1.105, 0.270],
      [-0.020, 1.092, 0.278],
      [0.000, 1.090, 0.281],
      [0.020, 1.092, 0.278],
      [0.043, 1.105, 0.270],
    ],
    0.0045,
    0x9b564e
  );
  face.add(mouth);

  // 頬は半透明の円。ゲーム内で強すぎる場合は opacity を 0.12 前後へ下げる。
  const cheekMaterial = basic(C.blush, {
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(new THREE.CircleGeometry(0.033, 12), cheekMaterial);
    cheek.position.set(0.145 * side, 1.145, 0.260);
    cheek.rotation.y = -0.22 * side;
    face.add(cheek);
  }

  parent.add(face);
  return face;
}

function addHair(parent) {
  const hair = new THREE.Group();

  // 後頭部。顔より少し大きい楕円球を後ろへ置き、ボブの外形を作る。
  const back = ellipsoid(0.305, 0.320, 0.245, C.hair, 16, 10);
  back.position.set(0, 1.235, -0.010);

  // こめかみを覆う小さな房。back の楕円だけだと、側頭部（目の横あたり）で
  // 地肌が三角に見えてしまう（back を単純に前へ大きくすると、今度は
  // 楕円の性質上いちばん前へ出っ張るのが顔の正面＝目鼻になってしまい、
  // 髪が顔にめり込む）。すきまだけを狙って小さく足す。
  for (const side of [-1, 1]) {
    const temple = ellipsoid(0.075, 0.110, 0.100, C.hair, 10, 8);
    temple.position.set(0.205 * side, 1.245, 0.150);
    hair.add(temple);
  }
  hair.add(back);

  // 左右の毛先。Player の既存「耳揺れ」処理へ接続できる関節にする。
  const tips = [];
  for (const side of [-1, 1]) {
    const joint = new THREE.Group();
    joint.position.set(0.235 * side, 1.130, 0.035);
    const tip = ellipsoid(0.072, 0.145, 0.070, C.hairDark, 8, 6);
    tip.position.y = -0.055;
    tip.rotation.z = -0.12 * side;
    joint.add(tip);
    hair.add(joint);
    tips.push(joint);
  }

  // 斜め前髪。少数の広い房に分け、水平なヘルメット形を避ける。
  const fringe = [
    { p: [-0.105, 1.400, 0.205], s: [0.105, 0.205, 0.055], r: -0.48 },
    { p: [0.005, 1.415, 0.220], s: [0.105, 0.220, 0.052], r: -0.32 },
    { p: [0.105, 1.385, 0.210], s: [0.085, 0.180, 0.050], r: -0.18 },
  ];
  for (const f of fringe) {
    const lock = ellipsoid(f.s[0], f.s[1], f.s[2], C.hair, 8, 6);
    lock.position.set(...f.p);
    lock.rotation.z = f.r;
    hair.add(lock);
  }

  parent.add(hair);
  return { hair, tips };
}

function makeArm(side) {
  const arm = new THREE.Group();
  arm.position.set(0.245 * side, 0.850, 0);

  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.047, 0.350, 8),
    material(C.white)
  );
  sleeve.position.y = -0.150;
  arm.add(sleeve);

  const cuff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.052, 0.052, 0.025, 8),
    material(C.black)
  );
  cuff.position.y = -0.330;
  arm.add(cuff);

  const hand = ellipsoid(0.048, 0.060, 0.045, C.skin, 10, 8);
  hand.position.y = -0.385;
  arm.add(hand);

  arm.rotation.z = -0.08 * side;
  return arm;
}

function makeFoot(side) {
  const foot = new THREE.Group();
  foot.position.set(0.105 * side, 0.095, 0.015);

  const leg = new THREE.Mesh(
    new THREE.CylinderGeometry(0.047, 0.047, 0.330, 8),
    material(C.skin)
  );
  leg.position.y = 0.165;
  foot.add(leg);

  const strap = new THREE.Mesh(
    new THREE.TorusGeometry(0.051, 0.011, 6, 12),
    material(C.black)
  );
  strap.rotation.x = Math.PI / 2;
  strap.position.y = 0.030;
  foot.add(strap);

  const shoe = ellipsoid(0.078, 0.045, 0.105, C.black, 10, 7);
  shoe.position.set(0, -0.030, 0.035);
  foot.add(shoe);

  return foot;
}

function addUniform(parent) {
  const uniform = new THREE.Group();

  // 胴とスカートを低ポリの円錐台で構成。
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.185, 0.210, 0.300, 10),
    material(C.white)
  );
  torso.position.y = 0.795;
  uniform.add(torso);

  const skirt = new THREE.Mesh(
    new THREE.CylinderGeometry(0.205, 0.292, 0.330, 10),
    material(C.white)
  );
  skirt.position.y = 0.500;
  uniform.add(skirt);

  const hem = new THREE.Mesh(
    new THREE.TorusGeometry(0.285, 0.018, 6, 10),
    material(C.black)
  );
  hem.rotation.x = Math.PI / 2;
  hem.scale.z = 0.88;
  hem.position.y = 0.335;
  uniform.add(hem);

  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(0.208, 0.014, 6, 10),
    material(C.black)
  );
  belt.rotation.x = Math.PI / 2;
  belt.scale.z = 0.88;
  belt.position.y = 0.645;
  uniform.add(belt);

  // 胸元のリボン。
  const bow = new THREE.Group();
  bow.position.set(0, 0.925, 0.190);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(
      new THREE.ConeGeometry(0.075, 0.135, 4),
      material(C.black)
    );
    wing.rotation.z = side * (Math.PI / 2);
    wing.position.x = side * 0.065;
    bow.add(wing);
  }
  const knot = ellipsoid(0.047, 0.047, 0.025, C.black, 8, 6);
  bow.add(knot);
  const medal = ellipsoid(0.018, 0.018, 0.012, C.gold, 8, 6);
  medal.position.set(0, -0.065, 0.015);
  bow.add(medal);
  uniform.add(bow);

  parent.add(uniform);
  return uniform;
}

export function buildHeroine() {
  const group = new THREE.Group();

  const feet = [-1, 1].map((side) => {
    const foot = makeFoot(side);
    group.add(foot);
    return foot;
  });

  const body = addUniform(group);

  const arms = [-1, 1].map((side) => {
    const arm = makeArm(side);
    group.add(arm);
    return arm;
  });

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.060, 0.065, 0.105, 10),
    material(C.skin)
  );
  neck.position.y = 1.000;
  group.add(neck);

  // 髪を先に、顔を後に置く。顔の輪郭の外側だけ後頭部が見える。
  const { tips: hairTips } = addHair(group);
  const head = ellipsoid(0.245, 0.275, 0.225, C.skin, 14, 10);
  head.position.set(0, 1.235, 0.055);
  group.add(head);
  const face = addFace(group);

  // player.js の既存インターフェースを保つための空オブジェクト。
  const tail = new THREE.Object3D();
  group.add(tail);

  const rest = {
    arms: arms.map((a) => ({
      x: a.position.x,
      y: a.position.y,
      z: a.position.z,
      rz: a.rotation.z,
    })),
    feet: feet.map((f) => ({
      x: f.position.x,
      y: f.position.y,
      z: f.position.z,
    })),
    // 既存の耳アニメーションで左右の毛先をわずかに揺らす。
    ears: hairTips.map((h) => ({ rz: h.rotation.z, rx: h.rotation.x })),
  };

  return {
    group,
    body,
    face,
    ears: hairTips,
    arms,
    feet,
    tail,
    rest,
  };
}
