// 焼き込み地図データの復号。DESIGN.md §3.3。
// rules/ には依存しない（§0.3 の層構造）。
import { GEO } from "../data/geo.js";

const Q = 65535;

function fromBase64(b64) {
  if (typeof Buffer !== "undefined") {
    const buf = Buffer.from(b64, "base64");
    // Buffer のバイト列を Int16Array として読み直す（アライメントのためコピーする）。
    const copy = new Uint8Array(buf.byteLength);
    copy.set(buf);
    return new Int16Array(copy.buffer);
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

// 連続差分を解いて [lon, lat, lon, lat, ...] の Float64Array にする。
function unpack(b64, box) {
  const d = fromBase64(b64);
  const n = d.length >> 1;
  const out = new Float64Array(n * 2);
  const [x0, y0, x1, y1] = box;
  const sx = (x1 - x0) / Q;
  const sy = (y1 - y0) / Q;
  let px = 0;
  let py = 0;
  for (let i = 0; i < n; i++) {
    px = (px + d[i * 2]) & 0xffff;
    py = (py + d[i * 2 + 1]) & 0xffff;
    out[i * 2] = x0 + px * sx;
    out[i * 2 + 1] = y0 + py * sy;
  }
  return out;
}

/** プレイヤー本体（台湾本島）の海岸線。閉じ点は含まない。 */
export function loadPlayerRing() {
  const flat = unpack(GEO.player.data, GEO.player.box);
  const ring = new Array(flat.length >> 1);
  for (let i = 0; i < ring.length; i++) ring[i] = [flat[i * 2], flat[i * 2 + 1]];
  return ring;
}

/**
 * 他の陸。ポリゴンごとに { rings, bbox } を返す。
 * rings[0] が外リング。`winding` が ±1 のリングは極を囲む（§3.3b）。
 */
export function loadLandBodies() {
  const flat = unpack(GEO.land.data, GEO.land.box);
  return GEO.land.polygons.map((p) => ({
    bbox: p.b,
    rings: p.r.map((r) => {
      const ring = new Array(r.n);
      for (let i = 0; i < r.n; i++) ring[i] = [flat[(r.o + i) * 2], flat[(r.o + i) * 2 + 1]];
      ring.winding = r.w;
      return ring;
    }),
  }));
}

export const GEO_SOURCE = GEO.source;
