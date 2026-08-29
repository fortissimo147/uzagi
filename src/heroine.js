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

const INK = "#221a15"; // 眉・まぶたの線。純黒より少し柔らかい色にして、きつく見えないようにする
const LIP = "#d76b7e"; // 赤みを抑えたやわらかいピンク

// ---------- 顔（頭の半径を1とする平行投影座標。右が+x、上が+y） ----------
const FACE_W = 0.86;
const FACE_H = 0.86;
const FACE_CY = -0.05;

const FACE = {
  // 眉：前回より弧をゆるめ、跳ね上げをほぼ無くして「きりっと」より
  // 「やわらかい」印象に寄せた。太さの変化は残す。
  brow: {
    p0: [0.098, 0.290],
    p1: [0.195, 0.340],
    p2: [0.335, 0.322],
    p3: [0.440, 0.262],
    wIn: 0.025,
    wOut: 0.011,
  },
  // 目：フィギュアを参考に、顔の中でしめる割合をひとまわり大きくした
  // （前は顔幅の約29%、今回は約34%）。上下にも広げて、丸く大きな
  // 「フィギュアの目」に近づけている。
  eye: {
    x: 0.270,
    y: 0.014,
    innerX: -0.152,
    outerX: 0.168,
    outerY: 0.012, // 目尻の跳ね上がり（前よりずっと控えめ）
    upperY: 0.168, // 上まぶたの高さ（前より高く＝目を大きく開く）
    lowerY: -0.118, // 下まぶたの深さ
  },
  liner: { w: 0.020, flick: 0.012 }, // アイライン太さと目尻の伸び（ごくわずか）
  iris: { rx: 0.150, ry: 0.158, drop: -0.004 },
  pupil: { r: 0.062 },
  gleamBig: { dx: -0.062, dy: 0.068, r: 0.056 },
  gleamSmall: { dx: 0.058, dy: -0.046, r: 0.024 },
  sparkle: { dx: -0.012, dy: -0.088, r: 0.015 }, // 下にもう一粒、瞳をきらきらさせる
  // 鼻・口は目を大きくした分、逆に小さく控えめにして「目が主役」の
  // フィギュアらしい配分にする。
  nose: { y: -0.128, w: 0.013, h: 0.034 },
  mouth: { y: -0.350, w: 0.084, peak: 0.024, dip: 0.010, low: 0.044, corner: 0.010 },
  blush: { x: 0.375, y: -0.170, rx: 0.118, ry: 0.064 },
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

// 太さが変わる線。眉の「内側が太く外側が細い」形を出すために使う（rabbit.js と同じ手）。
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
// 目・眉・口を「面と線を分けて重ねる」やり方で作る＝虹彩に丸みのある
// グラデーションを入れ、まぶたのラインを別の細い線で重ね、頬とあごに
// ごく薄い陰影を足すことで、丸目・一色塗りだった前より大人びた顔にする。
export function faceTexture() {
  if (faceCache) return faceCache;
  const S = 1024;
  const H = HEROINE.head;
  const PPU = S / FACE_W;
  const X = (nx) => S / 2 + nx * H.rx * PPU;
  const Y = (ny) => S / 2 - (ny * H.ry - FACE_CY) * PPU;
  const LX = (v) => v * H.rx * PPU;
  const LY = (v) => v * H.ry * PPU;
  const [cv, g] = canvas2d(S, S);

  // ---------- 頬・あごの陰影（顔を平たく見せないための輪郭陰影） ----------
  // こめかみとあごの両脇をごくわずかに暗くし、逆に額と鼻すじをわずかに
  // 明るくする。輪郭線は出さず、質感だけで丸みを足す。
  const shadeL = g.createLinearGradient(X(-0.5), 0, X(0.5), 0);
  shadeL.addColorStop(0, "rgba(70,55,45,0.16)");
  shadeL.addColorStop(0.16, "rgba(70,55,45,0)");
  shadeL.addColorStop(0.84, "rgba(70,55,45,0)");
  shadeL.addColorStop(1, "rgba(70,55,45,0.16)");
  g.fillStyle = shadeL;
  g.fillRect(0, 0, S, S);
  const glow = g.createRadialGradient(X(0), Y(0.22), 0, X(0), Y(0.22), LX(0.55));
  glow.addColorStop(0, "rgba(255,244,222,0.16)");
  glow.addColorStop(1, "rgba(255,244,222,0)");
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);

  // ---------- ほお紅 ----------
  const B = FACE.blush;
  for (const s of [-1, 1]) {
    const cx = X(B.x * s);
    const cy = Y(B.y);
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, LX(B.rx));
    grd.addColorStop(0, "rgba(233,140,142,0.42)");
    grd.addColorStop(1, "rgba(233,140,142,0)");
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

  // ---------- 眉：太さの変わる弓なりの線 ----------
  const W = FACE.brow;
  g.fillStyle = INK;
  for (const s of [-1, 1]) {
    const p = [W.p0, W.p1, W.p2, W.p3].map(([x, y]) => [X(x * s), Y(y)]);
    taperedStroke(g, bezier(p[0], p[1], p[2], p[3], 28), LX(W.wIn), LX(W.wOut));
  }

  // ---------- 目：切れ長のアーモンド形＋虹彩のグラデーション ----------
  const E = FACE.eye;
  const I = FACE.iris;
  const P = FACE.pupil;
  for (const s of [-1, 1]) {
    const eyeX = (lx) => X((E.x + lx) * s);
    const eyeY = (ly) => Y(E.y + ly);
    const inner = [eyeX(E.innerX), eyeY(0)];
    const outer = [eyeX(E.outerX), eyeY(E.outerY)];
    const upCtrl = [eyeX(E.outerX * 0.12), eyeY(E.upperY)];
    const loCtrl = [eyeX(-0.02), eyeY(E.lowerY)];

    // まぶたの内側を虹彩の色で塗る（アーモンド形そのものが目の形になる）
    g.beginPath();
    g.moveTo(inner[0], inner[1]);
    g.quadraticCurveTo(upCtrl[0], upCtrl[1], outer[0], outer[1]);
    g.quadraticCurveTo(loCtrl[0], loCtrl[1], inner[0], inner[1]);
    g.closePath();
    g.save();
    g.clip();
    const irisCx = eyeX(0.01);
    const irisCy = eyeY(I.drop);
    const irisGrd = g.createRadialGradient(
      irisCx,
      irisCy - LY(0.03),
      LX(0.01),
      irisCx,
      irisCy,
      LX(I.rx)
    );
    irisGrd.addColorStop(0, "#8a5a34"); // 明るい琥珀色を中心に置いて、瞳をきらきら見せる
    irisGrd.addColorStop(0.5, "#3c2415");
    irisGrd.addColorStop(1, "#150d09");
    g.fillStyle = irisGrd;
    g.beginPath();
    g.ellipse(irisCx, irisCy, LX(I.rx), LY(I.ry), 0, 0, Math.PI * 2);
    g.fill();
    // 瞳孔
    g.fillStyle = "#0a0605";
    g.beginPath();
    g.ellipse(irisCx, irisCy + LY(0.01), LX(P.r), LY(P.r), 0, 0, Math.PI * 2);
    g.fill();
    g.restore();

    // まぶたの線（上は太く、目尻でわずかに跳ね上げる。下はごく細く）
    g.strokeStyle = INK;
    g.lineWidth = LY(FACE.liner.w);
    g.beginPath();
    g.moveTo(inner[0], inner[1]);
    g.quadraticCurveTo(upCtrl[0], upCtrl[1], outer[0], outer[1]);
    g.stroke();
    // まぶたの線を目尻の少し先まで自然に伸ばす（跳ね上げすぎない）
    const tailX = eyeX(E.outerX + FACE.liner.flick * 0.55);
    const tailY = eyeY(E.outerY + FACE.liner.flick * 0.35);
    taperedStroke(g, [outer, [tailX, tailY]], LX(FACE.liner.w * 0.75), 0);
    g.lineWidth = LY(FACE.liner.w * 0.22);
    g.strokeStyle = "rgba(23,18,15,0.55)";
    g.beginPath();
    g.moveTo(eyeX(E.innerX * 0.6), eyeY(E.lowerY * 0.55));
    g.quadraticCurveTo(loCtrl[0], loCtrl[1], eyeX(E.outerX * 0.8), eyeY(E.lowerY * 0.3));
    g.stroke();
    g.strokeStyle = INK;

    // ハイライト：大きく柔らかいものと、小さく鋭いもの
    const Gb = FACE.gleamBig;
    const bigGrd = g.createRadialGradient(
      eyeX(Gb.dx),
      eyeY(Gb.dy),
      0,
      eyeX(Gb.dx),
      eyeY(Gb.dy),
      LX(Gb.r)
    );
    bigGrd.addColorStop(0, "rgba(255,250,240,0.95)");
    bigGrd.addColorStop(1, "rgba(255,250,240,0)");
    g.fillStyle = bigGrd;
    g.beginPath();
    g.ellipse(eyeX(Gb.dx), eyeY(Gb.dy), LX(Gb.r), LY(Gb.r), 0, 0, Math.PI * 2);
    g.fill();
    const Gs = FACE.gleamSmall;
    g.fillStyle = "#fffaf0";
    g.beginPath();
    g.ellipse(eyeX(Gs.dx), eyeY(Gs.dy), LX(Gs.r), LY(Gs.r), 0, 0, Math.PI * 2);
    g.fill();
    // もう一粒、下寄りに小さく。3点の光を散らすと瞳がきらきらして見える
    const Sp = FACE.sparkle;
    g.beginPath();
    g.ellipse(eyeX(Sp.dx), eyeY(Sp.dy), LX(Sp.r), LY(Sp.r), 0, 0, Math.PI * 2);
    g.fill();
  }

  // ---------- 鼻：ごく小さな陰影2つだけで示す（大きくすると汚れて見える） ----------
  const N = FACE.nose;
  for (const s of [-1, 1]) {
    const grd = g.createRadialGradient(X(N.w * s), Y(N.y), 0, X(N.w * s), Y(N.y), LX(0.016));
    grd.addColorStop(0, "rgba(70,50,38,0.20)");
    grd.addColorStop(1, "rgba(70,50,38,0)");
    g.fillStyle = grd;
    g.beginPath();
    g.ellipse(X(N.w * s), Y(N.y), LX(0.016), LY(0.011), 0, 0, Math.PI * 2);
    g.fill();
  }

  // ---------- 口：口角をわずかに上げた、やわらかい小さな口 ----------
  const M = FACE.mouth;
  const cx = X(0);
  const cy = Y(M.y);
  const w = LX(M.w);
  const peak = LY(M.peak);
  const dip = LY(M.dip);
  const low = LY(M.low);
  const corner = LY(M.corner); // 口角の上がり（プラスで微笑みになる）

  const lipGrd = g.createLinearGradient(cx, cy - peak, cx, cy + low);
  lipGrd.addColorStop(0, "#c85f74");
  lipGrd.addColorStop(0.4, LIP);
  lipGrd.addColorStop(1, "#e592a0");
  g.fillStyle = lipGrd;
  g.beginPath();
  g.moveTo(cx - w, cy - corner);
  // 上唇：ごく浅いキューピッドボウ（谷を前より浅くして険しく見せない）
  g.quadraticCurveTo(cx - w * 0.55, cy - peak, cx - w * 0.14, cy - dip * 0.7);
  g.quadraticCurveTo(cx - w * 0.04, cy - dip * 0.2, cx, cy - dip * 0.4);
  g.quadraticCurveTo(cx + w * 0.04, cy - dip * 0.2, cx + w * 0.14, cy - dip * 0.7);
  g.quadraticCurveTo(cx + w * 0.55, cy - peak, cx + w, cy - corner);
  // 下唇：ふっくらと丸く
  g.quadraticCurveTo(cx + w * 0.5, cy + low * 1.2, cx, cy + low * 1.32);
  g.quadraticCurveTo(cx - w * 0.5, cy + low * 1.2, cx - w, cy - corner);
  g.closePath();
  g.fill();

  // 口の閉じ目（上下の境の線）。口角を上げて、微笑んで見えるようにする
  g.strokeStyle = "rgba(150,70,84,0.5)";
  g.lineWidth = LY(0.012);
  g.beginPath();
  g.moveTo(cx - w * 0.82, cy - corner);
  g.quadraticCurveTo(cx, cy + dip * 0.35, cx + w * 0.82, cy - corner);
  g.stroke();

  // 下唇の艶
  const glossGrd = g.createRadialGradient(
    cx + w * 0.16,
    cy + low * 0.55,
    0,
    cx + w * 0.16,
    cy + low * 0.55,
    LX(0.045)
  );
  glossGrd.addColorStop(0, "rgba(255,235,232,0.55)");
  glossGrd.addColorStop(1, "rgba(255,235,232,0)");
  g.fillStyle = glossGrd;
  g.beginPath();
  g.ellipse(cx + w * 0.16, cy + low * 0.55, LX(0.05), LY(0.03), 0, 0, Math.PI * 2);
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
