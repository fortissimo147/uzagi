// 上陸地域。DESIGN.md §1b.5。
//
// 元ゲームの region(lon, lat) と同じ「経緯度しきい値のカスケード」方式。
// **これはゲーム用の幾何近似であり、中華民國の統計地區標準分類ではない。**
// 判定に渡すのは、当たった海岸線頂点の**元の経緯度**（動かした後の位置ではない）。
//
// 返すのは**キー**であって表示名ではない。表示名は言語ごとに rules/i18n.js が持つ（§7）。
import { REGION_KEYS } from "./i18n.js";

export { REGION_KEYS };

export function region(lon, lat) {
  if (lat >= 24.5) return "N";
  if (lat >= 24.3 && lon >= 121.4) return "N"; // 宜蘭
  if (lon >= 120.9 && lat >= 22.6) return "E"; // 花蓮・台東
  if (lat >= 23.5) return "C";
  return "S";
}
