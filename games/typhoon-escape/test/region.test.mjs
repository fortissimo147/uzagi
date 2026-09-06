import { check, section, summary } from "./harness.mjs";
import { region, REGIONS } from "../src/rules/region.js";
import { loadPlayerRing } from "../src/world/geo.js";

section("上陸地域（DESIGN.md §1b.5）");

const ring = loadPlayerRing();
const count = Object.fromEntries(REGIONS.map((r) => [r, 0]));
for (const [lon, lat] of ring) count[region(lon, lat)]++;

check("地域は 4 種（離島は本島に含まれないので不要）", REGIONS.length === 4);
for (const r of REGIONS) {
  check(`${r} に到達可能（本島の頂点が存在する）`, count[r] > 0, `${count[r]} 頂点 / ${((100 * count[r]) / ring.length).toFixed(1)}%`);
}
check("いずれの地域も極端に偏っていない（5% 以上）",
  REGIONS.every((r) => count[r] / ring.length >= 0.05),
  REGIONS.map((r) => `${r}:${((100 * count[r]) / ring.length).toFixed(1)}%`).join(" "));

section("主要都市の分類（座標は記憶に依る [推定]。分類そのものは検査対象）");
const SPOTS = [
  ["Taipei", 25.033, 121.5654, "Northern Taiwan"],
  ["Keelung", 25.128, 121.742, "Northern Taiwan"],
  ["Yilan", 24.757, 121.753, "Northern Taiwan"],
  ["Hsinchu", 24.804, 120.968, "Northern Taiwan"],
  ["Taichung", 24.147, 120.674, "Central Taiwan"],
  ["Changhua", 24.075, 120.516, "Central Taiwan"],
  ["Yunlin", 23.709, 120.431, "Central Taiwan"],
  ["Hualien", 23.976, 121.604, "Eastern Taiwan"],
  ["Taitung", 22.756, 121.144, "Eastern Taiwan"],
  ["Chiayi", 23.48, 120.449, "Southern Taiwan"],
  ["Tainan", 22.993, 120.203, "Southern Taiwan"],
  ["Kaohsiung", 22.615, 120.301, "Southern Taiwan"],
  ["Hengchun", 22.003, 120.744, "Southern Taiwan"],
];
for (const [name, lat, lon, want] of SPOTS) {
  const got = region(lon, lat);
  check(`${name} → ${want}`, got === want, `実際 ${got}`);
}

check("未知の座標でも必ず 4 種のいずれかを返す",
  [[0, 0], [90, 180], [-90, -180], [23.5, 120.9]].every(([la, lo]) => REGIONS.includes(region(lo, la))));

summary("region");
