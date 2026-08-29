// 主人公その2「白いスーツの人」の見た目だけを組み立てるモジュール。
// 動きは player.js が持ち、ここは形・色・顔のテクスチャだけを作る。
//
// 参考にしたのは「黒のボブ／黒で縁取った白いジャケット／白いミニスカート／
// 素足に黒のヒール」という組み合わせだけで、形はこのゲームの低ポリ調に
// 起こし直したもの。
//
// rabbit.js と同じものを返す（group / body / face / ears / arms / feet / tail / rest）。
// ears は「横の毛束」、tail は「スカートの後ろ」に読み替えて、
// player.js のアニメーションをそのまま使えるようにしてある。
import * as THREE from "three";

// ---------- 寸法（ワールド単位。足の裏が y=0） ----------
// うさぎが約1.73（耳の先まで）なので、それと並んで見劣りしない背丈にしてある。
// 頭ひとつ分を約0.48として、全体で3.4頭身。脚は全体の37%と長めにとった。
export const HEROINE = {
  head: { y: 1.458, rx: 0.198, ry: 0.212, rz: 0.188 },
  neck: { y: 1.205, r: 0.050, h: 0.095 },
  arm: { x: 0.208, y: 1.145, z: 0.0, r: 0.042, len: 0.44, splay: 0.17 },
  leg: { x: 0.078, top: 0.74, bottom: 0.095, rTop: 0.064, rBottom: 0.036 },
  shoe: { len: 0.175, w: 0.078, h: 0.042, heel: 0.075 },
};

// ジャケットの輪郭［高さ, 半径］。肩→胸→くびれた腰、と太さを変えるのが要。
// まっすぐな筒にすると寸胴に見えて、スーツに見えない。
// 裾はスカートより外へ張り出させる。ここが同じ太さだと上下がつながって
// ワンピースに見えてしまい、スーツに見えない。
const JACKET_PROFILE = [
  [0.858, 0.178],
  [0.888, 0.170],
  [0.925, 0.151],
  [0.968, 0.147],
  [1.022, 0.159],
  [1.080, 0.175],
  [1.135, 0.194],
  [1.168, 0.198],
  [1.188, 0.172],
  [1.198, 0.115],
];
const TORSO_DEPTH = 0.80; // 胴は前後に薄い

// スカートの輪郭。腰から裾へ向かって広がるミニ丈。
const SKIRT_PROFILE = [
  [0.638, 0.226],
  [0.690, 0.208],
  [0.760, 0.185],
  [0.840, 0.160],
  [0.908, 0.145],
];
const SKIRT_DEPTH = 0.86;

// ---------- 色 ----------
// 洞窟の照明は暗く緑がかっているので、白を白として見せるには反射率を
// 1より大きくとる必要がある（three.js の色は線形値なので 1 超を指定できる）。
// rabbit.js のクリーム色と同じ考え方。
const SUIT_RGB = [2.55, 2.50, 2.42]; // ジャケットとスカートの白
const SUIT_EM = 0x4c4a44;
const SKIN_RGB = [2.45, 1.98, 1.76]; // 肌
const SKIN_EM = 0x4a382e;
const HAIR_COL = 0x241811; // 髪（暗い茶）
const HAIR_EM = 0x120c08;
const TRIM_COL = 0x1b1b20; // 黒の縁取り・インナー・靴
const TRIM_EM = 0x0b0b0f;
const GOLD_COL = 0xc9a227;
const GOLD_EM = 0x4a3a05;

const INK = "#17120f";
const LIP = "#b8324a";

// ---------- 顔（頭の半径を1とする平行投影座標。右が+x、上が+y） ----------
const FACE_W = 0.86;
const FACE_H = 0.86;
const FACE_CY = -0.05;

const FACE = {
  brow: { x: 0.30, y: 0.34, w: 0.30, h: 0.055, tilt: 0.10 },
  eye: { x: 0.295, y: 0.01, rx: 0.112, ry: 0.104 },
  gleam: { x: -0.3, y: 0.34, r: 0.30 },
  lash: 0.035,
  mouth: { y: -0.40, w: 0.155, h: 0.075 },
  blush: { x: 0.40, y: -0.16, rx: 0.135, ry: 0.075 },
};

// ---------- 小道具 ----------

function mat(rgb, emissive, extra = {}) {
  const m = new THREE.MeshLambertMaterial({ emissive, ...extra });
  m.color.setRGB(...rgb);
  return m;
}

const suitMat = (extra) => mat(SUIT_RGB, SUIT_EM, extra);
const skinMat = (extra) => mat(SKIN_RGB, SKIN_EM, extra);
const trimMat = (extra) =>
  new THREE.MeshLambertMaterial({ color: TRIM_COL, emissive: TRIM_EM, ...extra });
const goldMat = () => new THREE.MeshLambertMaterial({ color: GOLD_COL, emissive: GOLD_EM });
const hairMat = (extra) =>
  new THREE.MeshLambertMaterial({ color: HAIR_COL, emissive: HAIR_EM, ...extra });

function ellipsoid(rx, ry, rz, seg = 20, rings = 16) {
  const g = new THREE.SphereGeometry(1, seg, rings);
  g.scale(rx, ry, rz);
  return g;
}

/** 上下で太さの違う筒。腕と脚はこれで作る。 */
function taper(rTop, rBottom, h, seg = 16) {
  return new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, true);
}

/** ［高さ, 半径］の並びを回してできる形。胴とスカートに使う。 */
function lathe(profile, seg = 22, depth = 1) {
  const geo = new THREE.LatheGeometry(
    profile.map(([y, r]) => new THREE.Vector2(Math.max(r, 0.0001), y)),
    seg
  );
  if (depth !== 1) geo.scale(1, 1, depth);
  geo.computeVertexNormals();
  return geo;
}

/** ジャケットの前面の z。飾りが浮いたり埋まったりしないよう輪郭から拾う。 */
function jacketFrontZ(y, proud = 0.006) {
  let r = JACKET_PROFILE[0][1];
  for (let i = 1; i < JACKET_PROFILE.length; i++) {
    const [y0, r0] = JACKET_PROFILE[i - 1];
    const [y1, r1] = JACKET_PROFILE[i];
    if (y >= y0 && y <= y1) {
      r = r0 + (r1 - r0) * ((y - y0) / (y1 - y0));
      break;
    }
  }
  return r * TORSO_DEPTH + proud;
}

function canvas2d(w, h) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d");
  g.lineCap = "round";
  g.lineJoin = "round";
  return [cv, g];
}

function toTexture(cv) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

// 顔の面のUVを「正面からの平行投影」に置き換える。球のUVのままだと
// 端が伸びて顔が歪む（rabbit.js と同じ手）。
function planarFaceUV(geo) {
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++)
    uv.setXY(i, 0.5 + p.getX(i) / FACE_W, 0.5 + (p.getY(i) - FACE_CY) / FACE_H);
  uv.needsUpdate = true;
  return geo;
}

// ---------- 顔のテクスチャ ----------

let faceCache = null;

// 顔は陰影を受けない「貼り紙」1枚。どの角度でも線が同じ濃さで見える。
export function faceTexture() {
  if (faceCache) return faceCache;
  const S = 640;
  const H = HEROINE.head;
  const PPU = S / FACE_W;
  const X = (nx) => S / 2 + nx * H.rx * PPU;
  const Y = (ny) => S / 2 - (ny * H.ry - FACE_CY) * PPU;
  const LX = (v) => v * H.rx * PPU;
  const LY = (v) => v * H.ry * PPU;
  const [cv, g] = canvas2d(S, S);

  // ほお紅。輪郭を出さず、ふんわりだけ置く
  const B = FACE.blush;
  for (const s of [-1, 1]) {
    const cx = X(B.x * s);
    const cy = Y(B.y);
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, LX(B.rx));
    grd.addColorStop(0, "rgba(236,148,150,0.5)");
    grd.addColorStop(1, "rgba(236,148,150,0)");
    g.save();
    g.translate(cx, cy);
    g.scale(1, B.ry / B.rx);
    g.translate(-cx, -cy);
    g.fillStyle = grd;
    g.beginPath();
    g.arc(cx, cy, LX(B.rx), 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  // 眉。目尻へ向かってゆるく下がる
  const W = FACE.brow;
  g.strokeStyle = INK;
  g.lineWidth = LY(W.h);
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(X((W.x - W.w / 2) * s), Y(W.y - W.tilt * 0.2));
    g.quadraticCurveTo(X(W.x * s), Y(W.y + W.tilt), X((W.x + W.w / 2) * s), Y(W.y - W.tilt));
    g.stroke();
  }

  // 目。黒目の上にまつげの線を重ね、光を左上に置く
  const E = FACE.eye;
  const G = FACE.gleam;
  for (const s of [-1, 1]) {
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(X(E.x * s), Y(E.y), LX(E.rx), LY(E.ry), 0, 0, Math.PI * 2);
    g.fill();
    // まつげ：目の上のふちを一段太くする
    g.strokeStyle = INK;
    g.lineWidth = LY(FACE.lash);
    g.beginPath();
    g.ellipse(X(E.x * s), Y(E.y), LX(E.rx), LY(E.ry), 0, Math.PI * 1.05, Math.PI * 1.95);
    g.stroke();
    const cx = X(E.x * s) + LX(E.rx) * G.x * s;
    const cy = Y(E.y) - LY(E.ry) * G.y;
    g.fillStyle = "#fdf6ea";
    g.beginPath();
    g.ellipse(cx, cy, LX(E.rx) * G.r, LY(E.ry) * G.r, 0, 0, Math.PI * 2);
    g.fill();
  }

  // 口。赤い小さな唇
  const M = FACE.mouth;
  const cx = X(0);
  const cy = Y(M.y);
  const w = LX(M.w);
  const h = LY(M.h);
  g.fillStyle = LIP;
  g.beginPath();
  g.moveTo(cx - w, cy);
  g.quadraticCurveTo(cx - w * 0.5, cy - h * 1.1, cx, cy - h * 0.25);
  g.quadraticCurveTo(cx + w * 0.5, cy - h * 1.1, cx + w, cy);
  g.quadraticCurveTo(cx + w * 0.4, cy + h * 1.25, cx, cy + h * 1.35);
  g.quadraticCurveTo(cx - w * 0.4, cy + h * 1.25, cx - w, cy);
  g.fill();

  faceCache = toTexture(cv);
  return faceCache;
}

// ---------- モデル本体 ----------

export function buildHeroine() {
  const R = HEROINE;
  const g = new THREE.Group();
  const suit = suitMat();
  const skin = skinMat();
  const trim = trimMat();
  const hair = hairMat();

  const add = (mesh, parent = g) => {
    parent.add(mesh);
    return mesh;
  };
  const put = (geo, material, x, y, z, parent = g) => {
    const m = new THREE.Mesh(geo, material);
    m.position.set(x, y, z);
    return add(m, parent);
  };

  // ================= 脚と靴 =================
  // 脚ごと前後に動かすので、それぞれを Group にして player.js に渡す。
  const feet = [];
  const legLen = R.leg.top - R.leg.bottom;
  const legGeo = taper(R.leg.rTop, R.leg.rBottom, legLen, 14);
  const S = R.shoe;
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(R.leg.x * s, 0, 0);
    put(legGeo, skin, 0, R.leg.bottom + legLen / 2, 0, leg);
    // 太ももの付け根と足首（筒の切り口を隠す役目も兼ねる）
    put(ellipsoid(R.leg.rTop, R.leg.rTop, R.leg.rTop, 12, 10), skin, 0, R.leg.top, 0, leg);
    put(ellipsoid(R.leg.rBottom, R.leg.rBottom, R.leg.rBottom, 10, 8), skin, 0, R.leg.bottom, 0, leg);

    // 靴。つま先の尖った黒のパンプス＋細いヒール＋足首のストラップ。
    const toe = put(ellipsoid(S.w, S.h, S.len * 0.62, 14, 10), trim, 0, S.h * 0.95, S.len * 0.20, leg);
    toe.rotation.x = -0.10;
    // かかとの台と細いヒール
    put(ellipsoid(S.w * 0.82, S.h * 0.95, S.len * 0.28, 12, 8), trim, 0, S.heel * 0.72, -S.len * 0.16, leg);
    put(
      new THREE.CylinderGeometry(0.013, 0.010, S.heel, 8),
      trim,
      0,
      S.heel / 2,
      -S.len * 0.30,
      leg
    );
    const strap = put(
      new THREE.TorusGeometry(R.leg.rBottom * 1.12, 0.010, 6, 14),
      trim,
      0,
      S.h * 2.6,
      0,
      leg
    );
    strap.rotation.x = Math.PI / 2;

    g.add(leg);
    feet.push(leg);
  }

  // ================= スカート =================
  const skirt = put(lathe(SKIRT_PROFILE, 22, SKIRT_DEPTH), suit, 0, 0, 0);
  // 裾の黒い縁取り
  const hemR = SKIRT_PROFILE[0][1];
  const hemY = SKIRT_PROFILE[0][0];
  const hem = put(
    new THREE.CylinderGeometry(hemR * 1.03, hemR * 1.05, 0.030, 22, 1, true),
    trim,
    0,
    hemY + 0.014,
    0
  );
  hem.scale.z = SKIRT_DEPTH;

  // ================= 胴（ジャケット） =================
  const torso = put(lathe(JACKET_PROFILE, 22, TORSO_DEPTH), suit, 0, 0, 0);
  const waistR = JACKET_PROFILE[0][1];
  const waistY = JACKET_PROFILE[0][0];
  // ジャケットの裾の黒い縁取り
  const jhem = put(
    new THREE.CylinderGeometry(waistR * 1.02, waistR * 1.05, 0.042, 22, 1, true),
    trim,
    0,
    waistY + 0.020,
    0
  );
  jhem.scale.z = TORSO_DEPTH;

  // 肩の丸み
  put(ellipsoid(0.192, 0.042, 0.150, 20, 10), suit, 0, 1.166, 0);

  // インナー（黒）。襟の V から覗くところだけ、体の面に沿わせて薄く置く。
  const inner = put(ellipsoid(0.042, 0.052, 0.014, 12, 10), trim, 0, 1.132, jacketFrontZ(1.132, 0.003));

  // 襟。黒い帯を2枚 V 字に。前立てより外側に置いて、胸を挟む形にする。
  for (const sd of [-1, 1]) {
    const lapel = put(
      new THREE.BoxGeometry(0.026, 0.125, 0.014),
      trim,
      0.052 * sd,
      1.128,
      jacketFrontZ(1.128)
    );
    lapel.rotation.z = 0.52 * sd;
    lapel.rotation.x = -0.20;
  }

  // 前立ての黒い線（みぞおちから裾へ）
  put(new THREE.BoxGeometry(0.018, 0.185, 0.018), trim, 0, 0.985, jacketFrontZ(0.985));

  // 金のボタン
  const gold = goldMat();
  const buttonGeo = ellipsoid(0.014, 0.014, 0.009, 10, 8);
  for (const y of [1.042, 0.962]) put(buttonGeo, gold, 0, y, jacketFrontZ(y, 0.010));
  // 胸のフラップと金ボタン
  for (const sd of [-1, 1]) {
    const flap = put(
      new THREE.BoxGeometry(0.056, 0.020, 0.014),
      trim,
      0.106 * sd,
      1.088,
      jacketFrontZ(1.088)
    );
    flap.rotation.z = -0.05 * sd;
    put(buttonGeo, gold, 0.106 * sd, 1.064, jacketFrontZ(1.064, 0.010));
  }

  // ================= 首とネックレス =================
  put(taper(R.neck.r, R.neck.r * 1.2, R.neck.h, 12), skin, 0, R.neck.y, 0);
  const chain = put(
    new THREE.TorusGeometry(R.neck.r * 1.22, 0.007, 6, 16),
    gold,
    0,
    R.neck.y - R.neck.h * 0.55,
    0.004
  );
  chain.rotation.x = Math.PI / 2;
  put(ellipsoid(0.013, 0.017, 0.010, 8, 8), gold, 0, R.neck.y - R.neck.h * 0.78, R.neck.r * 1.1);

  // ================= 腕 =================
  // player.js は腕を rotation.z で振る。人の腕は前後に振りたいので、
  // 外側の Group を90度ひねっておき、内側の z 回転が前後の振りになるようにする。
  // 外へ開く角度のほうは、ひねったあとの x 回転で与える。
  const arms = [];
  const A = R.arm;
  const sleeveLen = A.len * 0.60;
  const sleeveGeo = taper(A.r, A.r * 0.84, sleeveLen, 12);
  const foreGeo = taper(A.r * 0.80, A.r * 0.62, A.len - sleeveLen, 12);
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(A.x * s, A.y, A.z);
    pivot.rotation.y = (Math.PI / 2) * s;

    const arm = new THREE.Group(); // ← これを player.js に渡す（rest.rz = 0）
    // 外へ開く角度。pivot を90度ひねってあるので局所Xは左右で逆を向く。
    // ここで s を掛けると左右が同じ方向へ倒れてしまうので、掛けない。
    arm.rotation.x = -A.splay;
    // 肩の袖山
    put(ellipsoid(A.r * 1.02, A.r * 0.92, A.r * 1.02, 12, 10), suit, 0, -0.012, 0, arm);
    put(sleeveGeo, suit, 0, -sleeveLen / 2, 0, arm); // 二の腕（白い袖）
    put(foreGeo, suit, 0, -sleeveLen - (A.len - sleeveLen) / 2, 0, arm); // 前腕
    put(
      new THREE.CylinderGeometry(A.r * 0.66, A.r * 0.64, 0.026, 12, 1, true),
      trim,
      0,
      -A.len + 0.013,
      0,
      arm
    ); // 袖口の黒
    put(ellipsoid(A.r * 0.58, A.r * 0.72, A.r * 0.52, 10, 8), skin, 0, -A.len - 0.020, 0, arm); // 手

    pivot.add(arm);
    g.add(pivot);
    arms.push(arm);
  }

  // ================= 頭 =================
  const H = R.head;
  put(ellipsoid(H.rx, H.ry, H.rz, 24, 18), skin, 0, H.y, 0);

  // 顔は頭の正面に貼りつく1枚の殻。陰影を受けないので線がどこでも同じ濃さ。
  const faceGeo = new THREE.SphereGeometry(1, 24, 16, Math.PI / 2 - 1.0, 2.0, 0.70, 1.45);
  faceGeo.scale(H.rx * 1.01, H.ry * 1.01, H.rz * 1.01);
  planarFaceUV(faceGeo);
  const face = new THREE.Mesh(
    faceGeo,
    new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: true, depthWrite: false })
  );
  face.position.y = H.y;
  face.renderOrder = 1;
  g.add(face);

  // ================= 髪（ボブ） =================
  // 3枚に分ける。てっぺんは全周を覆い（開けると分け目に地肌が出る）、
  // その下は正面だけ開けて顔を出し、後ろにふくらみを足して肩までのボブにする。
  const HR = 1.05; // 頭に対する髪の厚み
  const OPEN = 1.15; // 顔を出すすき間（正面から片側のラジアン）
  const hairShell = hairMat({ side: THREE.DoubleSide });

  const crownGeo = new THREE.SphereGeometry(1, 26, 12, 0, Math.PI * 2, 0, 1.14);
  crownGeo.scale(H.rx * HR, H.ry * HR, H.rz * HR);
  const crown = put(crownGeo, hairShell, 0, H.y, 0);

  const sideGeo = new THREE.SphereGeometry(
    1,
    26,
    14,
    Math.PI / 2 + OPEN,
    Math.PI * 2 - OPEN * 2,
    1.13,
    1.37
  );
  sideGeo.scale(H.rx * HR, H.ry * HR, H.rz * HR);
  put(sideGeo, hairShell, 0, H.y, 0);

  // 後ろのふくらみ。えり足まで下ろすとボブに見える。
  const back = put(ellipsoid(H.rx * 1.03, H.ry * 0.80, H.rz * 0.78, 22, 16), hair, 0, H.y - 0.100, -0.055);

  // 横の毛束。顔の両脇を縁取る。player.js はこれを「耳」として揺らす。
  const ears = [];
  const lockGeo = ellipsoid(0.044, 0.125, 0.052, 10, 10);
  for (const s of [-1, 1]) {
    const joint = new THREE.Group();
    joint.position.set(H.rx * 1.00 * s, H.y + 0.03, -H.rz * 0.06);
    joint.rotation.z = 0.08 * s;
    const lock = new THREE.Mesh(lockGeo, hair);
    lock.position.y = -0.105;
    joint.add(lock);
    g.add(joint);
    ears.push(joint);
  }

  // ================= スカートの後ろ（player.js の tail 相当） =================
  // 揺らしても体から浮かないよう、裾の内側に薄く沿わせる。
  const tail = put(ellipsoid(hemR * 0.66, 0.045, 0.030, 12, 8), suit, 0, hemY + 0.055, -hemR * 0.62);

  const rest = {
    arms: arms.map((a) => ({ x: a.position.x, y: a.position.y, z: a.position.z, rz: a.rotation.z })),
    feet: feet.map((f) => ({ x: f.position.x, y: f.position.y, z: f.position.z })),
    ears: ears.map((e) => ({ rz: e.rotation.z, rx: e.rotation.x })),
  };

  return { group: g, body: torso, face, ears, arms, feet, tail, rest };
}
