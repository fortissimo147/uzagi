import { check, section, summary } from "./harness.mjs";
import { NAMES, NAME_GROUPS, NAMES_DISCLAIMER } from "../src/rules/names.js";

section("台風名（DESIGN.md §7）— すべて創作");

check("140 個ある", NAMES.length === 140, `実際 ${NAMES.length}`);
check("14 グループある", NAME_GROUPS.length === 14, `実際 ${NAME_GROUPS.length}`);
for (const g of NAME_GROUPS) check(`${g.group} は 10 個`, g.names.length === 10, `実際 ${g.names.length}`);
check("重複がない", new Set(NAMES).size === NAMES.length, `ユニーク ${new Set(NAMES).size}`);

const longest = NAMES.reduce((a, b) => (b.length > a.length ? b : a));
check("最長 17 文字以内（HUD とティッカーの折り返し対策）", longest.length <= 17, `"${longest}" ${longest.length} 文字`);
check("3 語以内", NAMES.every((n) => n.split(" ").length <= 3), NAMES.filter((n) => n.split(" ").length > 3).join(", "));
check("英数字と空白のみ", NAMES.every((n) => /^[A-Za-z0-9][A-Za-z0-9 ]*[A-Za-z0-9]$/.test(n)),
  NAMES.filter((n) => !/^[A-Za-z0-9][A-Za-z0-9 ]*[A-Za-z0-9]$/.test(n)).join(", "));

// 実在リストではないことを必ず明示する（§7）。文言が消えたら落ちる。
check("架空である旨の一文がある", typeof NAMES_DISCLAIMER === "string" && NAMES_DISCLAIMER.length > 40);
check("その一文が『公式ではない』と明言している",
  /fictional/i.test(NAMES_DISCLAIMER) && /not the official/i.test(NAMES_DISCLAIMER), NAMES_DISCLAIMER);

summary("names");
