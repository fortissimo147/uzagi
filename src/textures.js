// N64風のテクスチャをすべてcanvasで手続き生成する。
// 外部素材を一切使わないので、著作権的にクリーンかつ読み込み待ちゼロ。
import * as THREE from "three";

const cache = new Map();

function make(name, size, draw, repeat = [1, 1]) {
  const key = `${name}:${repeat[0]}x${repeat[1]}`;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const g = cv.getContext("2d");
  draw(g, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  // ドットがくっきり出るニアレスト補間＝当時の質感
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

function noise(g, size, count, colors, min, max) {
  for (let i = 0; i < count; i++) {
    const r = min + Math.random() * (max - min);
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    g.beginPath();
    g.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    g.fill();
  }
}

export const tex = {
  stone: (rx = 1, ry = 1) =>
    make(
      "stone",
      64,
      (g, s) => {
        g.fillStyle = "#c9c9c2";
        g.fillRect(0, 0, s, s);
        noise(g, s, 90, ["#b6b6ae", "#d8d8d1", "#a8a8a0", "#e2e2dc"], 1, 4);
      },
      [rx, ry]
    ),

  cobble: (rx = 1, ry = 1) =>
    make(
      "cobble",
      64,
      (g, s) => {
        g.fillStyle = "#b9b6ad";
        g.fillRect(0, 0, s, s);
        g.strokeStyle = "#8b887f";
        g.lineWidth = 2;
        const c = 4;
        const step = s / c;
        for (let y = 0; y < c; y++) {
          for (let x = 0; x < c; x++) {
            const ox = (y % 2) * step * 0.5;
            g.fillStyle = ["#c8c5bb", "#bfbcb2", "#d0cdc3"][(x + y) % 3];
            g.beginPath();
            g.roundRect(x * step + ox + 2, y * step + 2, step - 4, step - 4, 5);
            g.fill();
            g.stroke();
          }
        }
      },
      [rx, ry]
    ),

  wood: (rx = 1, ry = 1) =>
    make(
      "wood",
      64,
      (g, s) => {
        g.fillStyle = "#8a5a24";
        g.fillRect(0, 0, s, s);
        for (let y = 0; y < s; y += 8) {
          g.fillStyle = y % 16 === 0 ? "#9c6a2c" : "#7d4f1e";
          g.fillRect(0, y, s, 7);
          g.fillStyle = "rgba(60,34,10,0.55)";
          g.fillRect(0, y + 7, s, 1);
        }
        noise(g, s, 40, ["rgba(110,72,30,0.5)", "rgba(60,36,12,0.4)"], 1, 3);
      },
      [rx, ry]
    ),

  crystal: (rx = 1, ry = 1) =>
    make(
      "crystal",
      64,
      (g, s) => {
        g.fillStyle = "#2f9f92";
        g.fillRect(0, 0, s, s);
        for (let i = 0; i < 26; i++) {
          const x = Math.random() * s;
          const y = Math.random() * s;
          const r = 5 + Math.random() * 9;
          g.fillStyle = ["#57c8b6", "#3fb0a1", "#7ee0cf", "#268b80"][
            (Math.random() * 4) | 0
          ];
          g.beginPath();
          g.ellipse(x, y, r, r * 0.7, Math.random() * Math.PI, 0, Math.PI * 2);
          g.fill();
        }
      },
      [rx, ry]
    ),

  metal: (rx = 1, ry = 1) =>
    make(
      "metal",
      64,
      (g, s) => {
        g.fillStyle = "#4a5a72";
        g.fillRect(0, 0, s, s);
        g.strokeStyle = "#33405a";
        g.lineWidth = 3;
        g.strokeRect(3, 3, s - 6, s - 6);
        g.strokeStyle = "#6c7d97";
        g.lineWidth = 2;
        g.strokeRect(10, 10, s - 20, s - 20);
        g.fillStyle = "#2c3750";
        for (const [x, y] of [
          [6, 6],
          [s - 10, 6],
          [6, s - 10],
          [s - 10, s - 10],
        ])
          g.fillRect(x, y, 4, 4);
      },
      [rx, ry]
    ),

  checker: (rx = 1, ry = 1) =>
    make(
      "checker",
      64,
      (g, s) => {
        const h = s / 2;
        g.fillStyle = "#7fe6c2";
        g.fillRect(0, 0, s, s);
        g.fillStyle = "#2f7f68";
        g.fillRect(0, 0, h, h);
        g.fillRect(h, h, h, h);
      },
      [rx, ry]
    ),

  pillar: (rx = 1, ry = 1) =>
    make(
      "pillar",
      64,
      (g, s) => {
        g.fillStyle = "#0d4a41";
        g.fillRect(0, 0, s, s);
        for (let x = 0; x < s; x += 6) {
          g.fillStyle = x % 12 === 0 ? "#125c51" : "#0a3d36";
          g.fillRect(x, 0, 4, s);
        }
        noise(g, s, 30, ["rgba(30,120,105,0.35)", "rgba(4,30,26,0.4)"], 2, 6);
      },
      [rx, ry]
    ),

  brick: (rx = 1, ry = 1) =>
    make(
      "brick",
      64,
      (g, s) => {
        g.fillStyle = "#b8742f";
        g.fillRect(0, 0, s, s);
        g.fillStyle = "#8d5320";
        for (let y = 0; y < s; y += 16) {
          g.fillRect(0, y + 14, s, 2);
          const ox = (y / 16) % 2 === 0 ? 0 : 16;
          for (let x = 0; x < s; x += 32) g.fillRect((x + ox) % s, y, 2, 16);
        }
      },
      [rx, ry]
    ),
};

// キャラクター等に使うフラットな素材
export function flat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}
