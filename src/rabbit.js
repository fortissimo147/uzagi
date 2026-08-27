// 主人公「うさぎ」の見た目だけを組み立てるモジュール。
// 動きは player.js が持ち、ここは形・色・表情のテクスチャだけを作る。
//
// 寸法はすべて参考動画のコマを画素単位で測った実測値。測り方は次のとおり。
//   1. コマから体の輪郭を切り出し、1行ずつ幅を数える（tools/measure-ref.py）
//   2. その幅の列をそのまま回転体の輪郭にする（BODY_PROFILE）
//   3. 顔の線は暗い画素の連結成分として取り出し、首の向き（23度）を
//      打ち消してから、頭の半径を1とする座標に直す
// 体を球ひとつで作ると似ない。「頭のふくらみ→肩の段→丸い下半身」という
// 上下の太り方の変化が、このキャラらしさの中身になっている。
import * as THREE from "three";

// ---------- 寸法（ワールド単位。足の裏が y=0） ----------
// 実測（画素）→ ワールドの換算は 1px = 0.00933。
export const RABBIT = {
  // head は「顔テクスチャを貼る楕円」。体の輪郭のうち頭にあたる部分に合わせてある。
  head: { y: 0.770, rx: 0.571, ry: 0.518, rz: 0.486 },
  depth: 0.85, // 体の前後方向の薄さ（回転体を z 方向に縮める）
  ear: { x: 0.140, y: 1.045, z: 0.110, splay: 0.045, tilt: -0.03, turn: 0.34, len: 0.685 },
  arm: { x: 0.326, y: 0.250, z: 0.135, r: 0.062 },
  foot: { x: 0.125, y: 0.056, z: 0.055, r: 0.066 },
  tail: { y: 0.330, z: -0.330, r: 0.105 },
};

// 体の輪郭（[高さ, 半径]）。動画のコマを1行ずつ測った幅をそのまま並べたもの。
// 上は頭のてっぺん、下は足の付け根。これを回すと体ができる。
const BODY_PROFILE = [
  [0.000, 0.000],
  [0.025, 0.075],
  [0.055, 0.130],
  [0.085, 0.170],
  [0.112, 0.222],
  [0.140, 0.250],
  [0.168, 0.278],
  [0.196, 0.308],
  [0.224, 0.330],
  [0.252, 0.343],
  [0.280, 0.352],
  [0.308, 0.352],
  [0.336, 0.380],
  [0.364, 0.400],
  [0.392, 0.409],
  [0.420, 0.420],
  [0.448, 0.437],
  [0.476, 0.458],
  [0.504, 0.478],
  [0.532, 0.495],
  [0.560, 0.514],
  [0.588, 0.533],
  [0.616, 0.542],
  [0.644, 0.561],
  [0.672, 0.561],
  [0.700, 0.561],
  [0.728, 0.571],
  [0.756, 0.571],
  [0.784, 0.571],
  [0.812, 0.571],
  [0.840, 0.561],
  [0.868, 0.561],
  [0.896, 0.552],
  [0.924, 0.542],
  [0.952, 0.533],
  [0.980, 0.514],
  [1.008, 0.495],
  [1.036, 0.494],
  [1.064, 0.475],
  [1.092, 0.452],
  [1.120, 0.426],
  [1.148, 0.395],
  [1.176, 0.359],
  [1.204, 0.316],
  [1.232, 0.262],
  [1.260, 0.188],
  [1.288, 0.000],
];

// 顔テクスチャを貼る「平面」の大きさ。頭の中心から見た矩形で、
// この矩形が頭の正面に平行投影される。
const FACE_W = 0.92;
const FACE_H = 0.92;
const FACE_CY = -0.06; // 頭の中心からどれだけ下を顔の中心とみなすか

// 体の色。洞窟の照明は緑がかっていて暗いので、動画と同じ「明るい生クリーム」に
// するには 1.0 を超える反射率が要る（three.js の色は線形値なので 1 超も指定できる）。
// 値は動画のコマから測った明るさ（明部 252,237,207 ／ 暗部 122,114,99）に合わせた。
const CREAM_RGB = [2.74, 2.28, 1.92];
const CREAM_EM = 0x5a4e3c; // 影側の底上げ
const INK = "#14100d"; // 顔の線（陰影の影響を受けない基本マテリアルで描く）
const INK_SOFT = "#2a221d";

// ---------- 顔の配置（頭の半径を1とする平行投影座標。右が+x、上が+y） ----------
// 動画から測った値そのもの。ワールド単位へは rx / ry を掛けて直す。
const FACE = {
  // 眉：内側の上から始まり、外へ大きく下りていく急な曲線。
  // 内側の端が太く、外側の端が細い。ここが似る／似ないの分かれ目。
  brow: [
    [0.125, 0.298],
    [0.285, 0.306],
    [0.415, 0.174],
    [0.490, -0.094],
  ],
  browW: [0.042, 0.026], // 内側（太い）／外側（細い）
  eye: { x: 0.258, y: -0.161, rx: 0.100, ry: 0.090 },
  // 目の中のハイライト：中心から左上へずれた小さな丸
  gleam: { x: -0.36, y: 0.30, r: 0.28 },
  mouth: { y: -0.382, w: 0.182, h: 0.126, line: 0.027 },
  // ほおの斜線は4本。目より下、口と同じくらいの高さに並ぶ。
  cheek: { x0: 0.392, step: 0.047, y: -0.280, len: 0.051, lean: 0.028, line: 0.022 },
};

// ---------- 形をつくる小道具 ----------

function creamMaterial(extra = {}) {
  const m = new THREE.MeshLambertMaterial({ emissive: CREAM_EM, ...extra });
  m.color.setRGB(...CREAM_RGB);
  return m;
}

function ellipsoid(rx, ry, rz, seg = 32, rings = 24) {
  const g = new THREE.SphereGeometry(1, seg, rings);
  g.scale(rx, ry, rz);
  return g;
}

// 実測の輪郭はどうしても1画素ぶんのがたつきを含む。そのまま回すと横縞が出るので、
// 端（上下の閉じ口）を固定したまま、中の点だけ軽くならしてから使う。
function smoothProfile(points, passes = 2) {
  let r = points.map((p) => p[1]);
  const y = points.map((p) => p[0]);
  for (let k = 0; k < passes; k++) {
    const next = r.slice();
    for (let i = 1; i < r.length - 1; i++)
      next[i] = r[i - 1] * 0.25 + r[i] * 0.5 + r[i + 1] * 0.25;
    r = next;
  }
  return y.map((v, i) => [v, r[i]]);
}

// 顔の面のUVを「正面からの平行投影」に置き換える。
// 球のUVをそのまま使うと端が伸びて顔が歪むので、真正面から見て
// 描いたとおりに見えるようにする（当時のゲームの顔テクスチャと同じ考え方）。
function planarFaceUV(geo) {
  const p = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    uv.setXY(i, 0.5 + p.getX(i) / FACE_W, 0.5 + (p.getY(i) - FACE_CY) / FACE_H);
  }
  uv.needsUpdate = true;
  return geo;
}

function bezier(p0, p1, p2, p3, n) {
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ]);
  }
  return out;
}

// 太さが変わる線。眉の「内側が太く外側が細い」形を出すために使う。
function taperedStroke(g, pts, w0, w1) {
  const n = pts.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * w;
    const ny = (dx / len) * w;
    left.push([pts[i][0] + nx, pts[i][1] + ny]);
    right.push([pts[i][0] - nx, pts[i][1] - ny]);
  }
  g.beginPath();
  g.moveTo(left[0][0], left[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(left[i][0], left[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(right[i][0], right[i][1]);
  g.closePath();
  g.fill();
  g.beginPath();
  g.arc(pts[0][0], pts[0][1], w0 / 2, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(pts[n - 1][0], pts[n - 1][1], w1 / 2, 0, Math.PI * 2);
  g.fill();
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

function toTexture(cv, clamp = true) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  if (clamp) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 4;
  return t;
}

// ---------- 顔のテクスチャ ----------

let faceCache = null;

// 顔は「陰影を受けない貼り紙」1枚。動画の顔の線がどの角度でも同じ濃さで
// 見えるのは、こういうテクスチャだから。透ける部分は体の地色がそのまま出る。
export function faceTexture() {
  if (faceCache) return faceCache;
  const S = 768;
  const H = RABBIT.head;
  const PPU = S / FACE_W;
  // 頭の半径を1とする座標 → キャンバスの画素
  const X = (nx) => S / 2 + nx * H.rx * PPU;
  const Y = (ny) => S / 2 - (ny * H.ry - FACE_CY) * PPU;
  const LX = (v) => v * H.rx * PPU; // 横方向の長さ
  const LY = (v) => v * H.ry * PPU; // 縦方向の長さ
  const E = FACE.eye;
  const G = FACE.gleam;

  const [cv, g] = canvas2d(S, S);

  // 眉
  g.fillStyle = INK;
  for (const s of [-1, 1]) {
    const p = FACE.brow.map(([x, y]) => [X(x * s), Y(y)]);
    taperedStroke(g, bezier(p[0], p[1], p[2], p[3], 32), LX(FACE.browW[0]), LX(FACE.browW[1]));
  }

  // 目：黒い楕円の中に、左上へずれた小さなハイライト
  for (const s of [-1, 1]) {
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(X(E.x * s), Y(E.y), LX(E.rx), LY(E.ry), 0, 0, Math.PI * 2);
    g.fill();
    const cx = X(E.x * s) + LX(E.rx) * G.x * s;
    const cy = Y(E.y) - LY(E.ry) * G.y;
    g.fillStyle = "#fbf3e0";
    g.beginPath();
    g.ellipse(cx, cy, LX(E.rx) * G.r, LY(E.ry) * G.r, 0, 0, Math.PI * 2);
    g.fill();
  }

  // 口：小さな ω 形
  const M = FACE.mouth;
  const mx = (t) => X(t * M.w / 2);
  const my = (t) => Y(M.y + (t * M.h) / 2);
  g.strokeStyle = INK;
  g.lineWidth = LX(M.line);
  g.beginPath();
  g.moveTo(mx(-0.95), my(1.0));
  g.bezierCurveTo(mx(-0.86), my(-1.1), mx(-0.24), my(-1.2), mx(-0.10), my(0.15));
  g.bezierCurveTo(mx(0.06), my(-0.95), mx(0.70), my(-0.85), mx(1.0), my(0.85));
  g.stroke();

  // ほおの斜線（左右4本ずつ）
  const C = FACE.cheek;
  g.strokeStyle = INK_SOFT;
  g.lineWidth = LX(C.line);
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const x = C.x0 + i * C.step;
      g.beginPath();
      g.moveTo(X((x + C.lean / 2) * s), Y(C.y + C.len / 2));
      g.lineTo(X((x - C.lean / 2) * s), Y(C.y - C.len / 2));
      g.stroke();
    }
  }

  faceCache = toTexture(cv);
  return faceCache;
}

// ---------- 体のテクスチャ ----------

let bodyCache = null;

// 頭が下半身にかぶさるあたりに、ごく淡い影の帯を1本入れる。
// 動画では頭と胴の境目がこの影だけで表現されていて、輪郭には段差が出ない。
// 球を2つ重ねて作ると交差の線が硬く出てしまうので、こちらのほうが近い。
export function bodyTexture() {
  if (bodyCache) return bodyCache;
  const W = 8;
  const H = 256;
  const [cv, g] = canvas2d(W, H);
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);
  // 回転体のUVは v=0 が下、v=1 が上。画像は上下が逆なので 1-v で置く。
  const band = (v, half, dark) => {
    const cy = H * (1 - v);
    const grd = g.createLinearGradient(0, cy - H * half, 0, cy + H * half);
    grd.addColorStop(0, "rgba(96,88,74,0)");
    grd.addColorStop(0.5, `rgba(96,88,74,${dark})`);
    grd.addColorStop(1, "rgba(96,88,74,0)");
    g.fillStyle = grd;
    g.fillRect(0, cy - H * half, W, H * half * 2);
  };
  band(0.30, 0.085, 0.62); // 頭のふちが落とす影
  band(0.15, 0.070, 0.30); // 下半身の丸みの下側
  bodyCache = toTexture(cv, false);
  return bodyCache;
}

// ---------- 耳のテクスチャ ----------

let earCache = null;

// 耳は「外側はクリーム、内側だけ淡いピンク、先だけ白っぽい」。
// 別部品を前に貼ると縁が硬くなるので、1枚のテクスチャでにじませる。
// 横方向(u)が耳のまわり、縦方向(v)が根元(0)→先(1)。
export function earTexture() {
  if (earCache) return earCache;
  const W = 128;
  const H = 256;
  const [cv, g] = canvas2d(W, H);
  // 下地は白。マテリアルの色をそのまま通したいので、ここで暗くしない。
  // （下地をクリーム色にすると乗算で耳だけ体より暗くなってしまう）
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, W, H);

  // 内側のピンク。u=0.5 が正面、v は根元0→先1（キャンバスは上下が逆）。
  // 動画では耳の中ほどにふんわり乗っているだけで、輪郭は出ていない。
  const cx = W * 0.5;
  const cy = H * (1 - 0.46);
  const rx = W * 0.17;
  const ry = H * 0.26;
  const grd = g.createRadialGradient(cx, cy, 0, cx, cy, rx);
  grd.addColorStop(0, "rgba(244,168,182,0.88)");
  grd.addColorStop(0.5, "rgba(246,186,197,0.70)");
  grd.addColorStop(1, "rgba(250,220,224,0)");
  g.save();
  g.translate(cx, cy);
  g.scale(1, ry / rx);
  g.translate(-cx, -cy);
  g.fillStyle = grd;
  g.beginPath();
  g.arc(cx, cy, rx, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // 先端はほんのり冷たい白（動画でも耳の先だけ白〜薄緑に光る）
  const tip = g.createLinearGradient(0, 0, 0, H * 0.30);
  tip.addColorStop(0, "rgba(178,242,228,0.95)");
  tip.addColorStop(0.3, "rgba(205,247,238,0.7)");
  tip.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = tip;
  g.fillRect(0, 0, W, H * 0.30);

  earCache = toTexture(cv, false);
  return earCache;
}

// 耳の輪郭。根元は細く、上から4割あたりがいちばん太く、先は丸い。
function earProfile(len) {
  const pts = [
    [0.063, 0.000],
    [0.067, 0.100],
    [0.072, 0.220],
    [0.078, 0.320],
    [0.090, 0.450],
    [0.097, 0.560],
    [0.097, 0.614],
    [0.094, 0.641],
    [0.084, 0.667],
    [0.064, 0.694],
    [0.042, 0.710],
    [0.004, 0.720],
  ];
  return pts.map(([r, y]) => new THREE.Vector2(r, (y / 0.72) * len));
}

// ---------- モデル本体 ----------

export function buildRabbit() {
  const R = RABBIT;
  const g = new THREE.Group();
  const cream = creamMaterial();

  // 体は「頭の球＋胴の球」ではなく、実測の輪郭をそのまま回した1つの回転体。
  // 球を2つ重ねると交差の線が硬く出てキノコのように見えるが、
  // 動画のつなぎ目はごく淡い陰影なので、こちらのほうが近い。
  // 回転体のつなぎ目は法線が割れて筋が出る。phiStart を π にして背中側へ回す。
  const bodyGeo = new THREE.LatheGeometry(
    smoothProfile(BODY_PROFILE).map(([y, r]) => new THREE.Vector2(Math.max(r, 0.0001), y)),
    26,
    Math.PI,
    Math.PI * 2
  );
  bodyGeo.scale(1, 1, R.depth); // 前後をわずかに薄く（真円ではない）
  bodyGeo.computeVertexNormals();
  const body = new THREE.Mesh(bodyGeo, creamMaterial({ map: bodyTexture() }));
  g.add(body);

  // 顔は体の正面に貼りつく1枚の殻。体よりわずかに外側に置いてZ争いを避ける。
  // 陰影を受けない基本マテリアルなので、動画と同じく線がどこでも同じ濃さで見える。
  const H = R.head;
  const faceGeo = new THREE.SphereGeometry(1, 24, 16, Math.PI / 2 - 1.15, 2.3, 0.62, 1.72);
  faceGeo.scale(H.rx * 1.008, H.ry * 1.008, H.rz * 1.008);
  planarFaceUV(faceGeo);
  const face = new THREE.Mesh(
    faceGeo,
    new THREE.MeshBasicMaterial({ map: faceTexture(), transparent: true, depthWrite: false })
  );
  face.position.y = H.y;
  face.renderOrder = 1;
  g.add(face);

  // 耳（付け根を軸に振れるよう、Group を関節にする）
  // 回転体＋1枚テクスチャ。u=0.5 が正面に来るよう phiStart を -π にしてある。
  const ears = [];
  const earGeo = new THREE.LatheGeometry(earProfile(R.ear.len), 14, -Math.PI, Math.PI * 2);
  const earMat = creamMaterial({ map: earTexture() });
  for (const s of [-1, 1]) {
    const joint = new THREE.Group();
    joint.position.set(R.ear.x * s, R.ear.y, R.ear.z);
    joint.rotation.z = -R.ear.splay * s;
    joint.rotation.x = R.ear.tilt;
    // 耳の内側は正面ではなく内向き。動画で片方の耳だけピンクが強く見えるのはこのため。
    joint.rotation.y = -R.ear.turn * s;
    joint.add(new THREE.Mesh(earGeo, earMat));
    g.add(joint);
    ears.push(joint);
  }

  // 手（胴の脇から、ちょこんと外へ出るふくらみ）
  const arms = [];
  const armGeo = ellipsoid(R.arm.r * 0.9, R.arm.r * 1.25, R.arm.r * 0.95, 12, 10);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, cream);
    arm.position.set(R.arm.x * s, R.arm.y, R.arm.z);
    arm.rotation.z = 0.28 * s;
    g.add(arm);
    arms.push(arm);
  }

  // 足（胴の下からちょこんと出る）
  const feet = [];
  const footGeo = ellipsoid(R.foot.r * 0.92, R.foot.r * 0.80, R.foot.r * 1.25, 12, 10);
  for (const s of [-1, 1]) {
    const foot = new THREE.Mesh(footGeo, cream);
    foot.position.set(R.foot.x * s, R.foot.y, R.foot.z);
    g.add(foot);
    feet.push(foot);
  }

  // しっぽ
  const tail = new THREE.Mesh(ellipsoid(R.tail.r, R.tail.r, R.tail.r * 0.8, 12, 10), cream);
  tail.position.set(0, R.tail.y, R.tail.z);
  g.add(tail);

  const rest = {
    arms: arms.map((a) => ({ x: a.position.x, y: a.position.y, z: a.position.z, rz: a.rotation.z })),
    feet: feet.map((f) => ({ x: f.position.x, y: f.position.y, z: f.position.z })),
    ears: ears.map((e) => ({ rz: e.rotation.z, rx: e.rotation.x })),
  };

  return { group: g, body, face, ears, arms, feet, tail, rest };
}
