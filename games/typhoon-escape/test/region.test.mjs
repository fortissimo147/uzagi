import { check, section, summary } from "./harness.mjs";
import { region, REGION_KEYS } from "../src/rules/region.js";
import { STRINGS } from "../src/rules/i18n.js";
import { loadPlayerRing } from "../src/world/geo.js";

section("上陸地域（DESIGN.md §1b.5）");

const ring = loadPlayerRing();
const count = Object.fromEntries(REGION_KEYS.map((r) => [r, 0]));
for (const [lon, lat] of ring) count[region(lon, lat)]++;

check("地域は 4 種（離島は本島に含まれないので不要）", REGION_KEYS.length === 4);
for (const r of REGION_KEYS) {
  check(`${r} に到達可能（本島の頂点が存在する）`, count[r] > 0, `${count[r]} 頂点 / ${((100 * count[r]) / ring.length).toFixed(1)}%`);
}
check("いずれの地域も極端に偏っていない（5% 以上）",
  REGION_KEYS.every((r) => count[r] / ring.length >= 0.05),
  REGION_KEYS.map((r) => `${r}:${((100 * count[r]) / ring.length).toFixed(1)}%`).join(" "));

section("主要都市の分類（座標は記憶に依る [推定]。分類そのものは検査対象）");
const SPOTS = [
  ["Taipei", 25.033, 121.5654, "N"],
  ["Keelung", 25.128, 121.742, "N"],
  ["Yilan", 24.757, 121.753, "N"],
  ["Hsinchu", 24.804, 120.968, "N"],
  ["Taichung", 24.147, 120.674, "C"],
  ["Changhua", 24.075, 120.516, "C"],
  ["Yunlin", 23.709, 120.431, "C"],
  ["Hualien", 23.976, 121.604, "E"],
  ["Taitung", 22.756, 121.144, "E"],
  ["Chiayi", 23.48, 120.449, "S"],
  ["Tainan", 22.993, 120.203, "S"],
  ["Kaohsiung", 22.615, 120.301, "S"],
  ["Hengchun", 22.003, 120.744, "S"],
];
for (const [name, lat, lon, want] of SPOTS) {
  const got = region(lon, lat);
  check(`${name} → ${want}`, got === want, `実際 ${got}`);
}

section("地域名の対訳（DESIGN.md §7）");
for (const code of Object.keys(STRINGS)) {
  const names = REGION_KEYS.map((k) => STRINGS[code].regions[k]);
  check(`${code}: 4 地域すべてに名前がある`, names.every((n) => typeof n === "string" && n.length > 0), names.join(" / "));
  check(`${code}: 4 地域の名前が互いに異なる`, new Set(names).size === 4, names.join(" / "));
}

check("未知の座標でも必ず 4 種のいずれかを返す",
  [[0, 0], [90, 180], [-90, -180], [23.5, 120.9]].every(([la, lo]) => REGION_KEYS.includes(region(lo, la))));

summary("region");
