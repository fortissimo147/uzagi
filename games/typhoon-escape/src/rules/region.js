// 上陸地域。DESIGN.md §1b.5。
//
// 元ゲームの region(lon, lat) と同じ「経緯度しきい値のカスケード」方式。
// **これはゲーム用の幾何近似であり、中華民國の統計地區標準分類ではない。**
// 判定に渡すのは、当たった海岸線頂点の**元の経緯度**（動かした後の位置ではない）。

export const REGIONS = ["Northern Taiwan", "Central Taiwan", "Southern Taiwan", "Eastern Taiwan"];

export function region(lon, lat) {
  if (lat >= 24.5) return "Northern Taiwan";
  if (lat >= 24.3 && lon >= 121.4) return "Northern Taiwan"; // 宜蘭
  if (lon >= 120.9 && lat >= 22.6) return "Eastern Taiwan"; // 花蓮・台東
  if (lat >= 23.5) return "Central Taiwan";
  return "Southern Taiwan";
}
