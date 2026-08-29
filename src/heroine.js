// 主人公その2「白いスーツの人」の見た目だけを組み立てるモジュール。
// 動きは player.js が持ち、ここは形・色・顔のテクスチャだけを作る。
//
// 体（頭の形・ジャケット・スカート・靴など）は「黒のボブ／黒で縁取った
// 白いジャケット／白いミニスカート／素足に黒のヒール」という組み合わせを
// 低ポリ調に起こし直したもの。頭身・顔パーツの大きさもフィギュア写真の
// 比率を参考に作った（HEROINE の頭上コメント参照）。
//
// 顔だけは作り方が違う。手続きで描くのをやめて、参考にした写真の顔を
// そのまま切り抜いて劣化させて貼っている（詳しくは heroine-face.js）。
//
// rabbit.js と同じものを返す（group / body / face / ears / arms / feet / tail / rest）。
// ears は「横の毛束」、tail は「スカートの後ろ」に読み替えて、
// player.js のアニメーションをそのまま使えるようにしてある。
import * as THREE from "three";
import { HEROINE_FACE_URI } from "./heroine-face.js";

// ---------- 寸法（ワールド単位。足の裏が y=0） ----------
// 送られたフィギュア（マリオ／ピーチ）の比率を参考に、頭を大きく・胴と脚を
// 短く・全体をずんぐりさせた「SD（デフォルメ）比率」に作り直した。
// 全高 1.42（前は 1.55）、頭の直径が全高の約38%＝2.6頭身ほど。
// 前は3.4頭身の等身に近い体だったので、頭ひとつぶんの大きさそのものと、
// 胴・脚を刻む位置を総入れ替えしている。
export const HEROINE = {
  head: { y: 1.150, rx: 0.258, ry: 0.270, rz: 0.244 },
  neck: { y: 0.855, r: 0.062, h: 0.070 },
  arm: { x: 0.200, y: 0.790, z: 0.0, r: 0.050, len: 0.30, splay: 0.19 },
  leg: { x: 0.086, top: 0.42, bottom: 0.078, rTop: 0.074, rBottom: 0.044 },
  shoe: { len: 0.165, w: 0.082, h: 0.040, heel: 0.062 },
};

// ジャケットの輪郭［高さ, 半径］。肩→胸→くびれた腰、と太さを変えるのが要。
// まっすぐな筒にすると寸胴に見えて、スーツに見えない。
// 裾はスカートより外へ張り出させる。ここが同じ太さだと上下がつながって
// ワンピースに見えてしまい、スーツに見えない。
// 胴の高さは 0.20（前は 0.34）に詰めた。半径は前とほぼ同じにしてあるので、
// 相対的に丸くずんぐりして見える。
const JACKET_PROFILE = [
  [0.620, 0.178],
  [0.638, 0.170],
  [0.659, 0.151],
  [0.685, 0.147],
  [0.716, 0.159],
  [0.751, 0.175],
  [0.783, 0.194],
  [0.802, 0.198],
  [0.814, 0.172],
  [0.820, 0.115],
];
const TORSO_DEPTH = 0.80; // 胴は前後に薄い

// スカートの輪郭。腰から裾へ向かって広がるミニ丈。
// 脚の付け根（HEROINE.leg.top=0.42）へすき間なく届くよう裾を 0.40 に、
// 半径は少し大きくしてジャケット同様ずんぐりさせた。
const SKIRT_PROFILE = [
  [0.400, 0.237],
  [0.447, 0.218],
  [0.511, 0.194],
  [0.583, 0.168],
  [0.645, 0.152],
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

// 顔の面のUVを「正面からの平行投影」に置き換える。球のUVのままだと
// 端が伸びて顔が歪む（rabbit.js と同じ手）。
//
// UV は幾何パッチの実際の外接矩形（頂点のX・Yの最小最大）から作る。
// 固定の比率定数で合わせようとすると、頭の大きさやパッチの切り出し方を
// 変えるたびにずれる（実際、頭を大きくしたときに画像が顔の中心だけへ
// 寄ってしまうバグになった）。外接矩形なら、画像がそのまま端から端まで
// パッチいっぱいに貼られる。
function planarFaceUV(geo) {
  const p = geo.attributes.position;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++)
    uv.setXY(i, (p.getX(i) - minX) / (maxX - minX), (p.getY(i) - minY) / (maxY - minY));
  uv.needsUpdate = true;
  return geo;
}

// ---------- 顔のテクスチャ ----------
// 手続きで描くのはやめて、heroine-face.js の画像（写真を切り抜いて
// 劣化させたもの）をそのまま読み込む。data URI なのでネットワークは
// 発生せず、ページ内に埋め込まれた画像がすぐ使える。
let faceCache = null;
const faceLoader = new THREE.TextureLoader();

export function faceTexture() {
  if (faceCache) return faceCache;
  const t = faceLoader.load(HEROINE_FACE_URI);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  // data URI は同期に近い速さで解ければ十分だが、three.js のテクスチャは
  // 読み込み前でも先に使い始められる（読めた時点で自動的に描き直される）。
  faceCache = t;
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
    new THREE.CylinderGeometry(waistR * 1.02, waistR * 1.05, 0.025, 22, 1, true),
    trim,
    0,
    waistY + 0.012,
    0
  );
  jhem.scale.z = TORSO_DEPTH;

  // 肩の丸み
  put(ellipsoid(0.192, 0.038, 0.150, 20, 10), suit, 0, 0.801, 0);

  // インナー（黒）。襟の V から覗くところだけ、体の面に沿わせて薄く置く。
  const inner = put(ellipsoid(0.042, 0.040, 0.014, 12, 10), trim, 0, 0.781, jacketFrontZ(0.781, 0.003));

  // 襟。黒い帯を2枚 V 字に。前立てより外側に置いて、胸を挟む形にする。
  for (const sd of [-1, 1]) {
    const lapel = put(
      new THREE.BoxGeometry(0.026, 0.075, 0.014),
      trim,
      0.052 * sd,
      0.779,
      jacketFrontZ(0.779)
    );
    lapel.rotation.z = 0.52 * sd;
    lapel.rotation.x = -0.20;
  }

  // 前立ての黒い線（みぞおちから裾へ）
  put(new THREE.BoxGeometry(0.018, 0.109, 0.018), trim, 0, 0.695, jacketFrontZ(0.695));

  // 金のボタン
  const gold = goldMat();
  const buttonGeo = ellipsoid(0.014, 0.014, 0.009, 10, 8);
  for (const y of [0.728, 0.681]) put(buttonGeo, gold, 0, y, jacketFrontZ(y, 0.010));
  // 胸のフラップと金ボタン
  for (const sd of [-1, 1]) {
    const flap = put(
      new THREE.BoxGeometry(0.056, 0.020, 0.014),
      trim,
      0.106 * sd,
      0.755,
      jacketFrontZ(0.755)
    );
    flap.rotation.z = -0.05 * sd;
    put(buttonGeo, gold, 0.106 * sd, 0.741, jacketFrontZ(0.741, 0.010));
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
  const tail = put(ellipsoid(hemR * 0.66, 0.045, 0.030, 12, 8), suit, 0, hemY + 0.035, -hemR * 0.62);

  const rest = {
    arms: arms.map((a) => ({ x: a.position.x, y: a.position.y, z: a.position.z, rz: a.rotation.z })),
    feet: feet.map((f) => ({ x: f.position.x, y: f.position.y, z: f.position.z })),
    ears: ears.map((e) => ({ rz: e.rotation.z, rx: e.rotation.x })),
  };

  return { group: g, body: torso, face, ears, arms, feet, tail, rest };
}
