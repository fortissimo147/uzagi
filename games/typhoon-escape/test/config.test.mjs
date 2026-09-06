import { check, near, section, summary } from "./harness.mjs";
import { CFG, ORIG, PATTERNS, BODY_PX, BODY_DEG, A, K_TW } from "../src/rules/config.js";

section("換算表（DESIGN.md §1b）");

// --- これが移植の正しさを守る唯一の防波堤（§9） ---
// 元ゲームの「px 空間での比」と、本作の「度空間での比」が一致すること。
section("無次元比の保存 — 元ゲームと同一であること");
const M = ORIG.M;
const pairs = [
  ["致死半径(ピーク最大)/自国外接半径", ((M * 0.05 + M * 0.035) * ORIG.LETHAL) / BODY_PX, (CFG.R_PEAK_MIN + CFG.R_PEAK_RAND) * CFG.LETHAL / BODY_DEG],
  ["致死半径(ピーク最小)/自国外接半径", (M * 0.05 * ORIG.LETHAL) / BODY_PX, (CFG.R_PEAK_MIN * CFG.LETHAL) / BODY_DEG],
  ["初期半径/自国外接半径", (M * 0.015) / BODY_PX, CFG.R_INIT / BODY_DEG],
  ["消滅しきい値/自国外接半径", (M * 0.012) / BODY_PX, CFG.R_DIE / BODY_DEG],
  ["プレイヤー速度/自国外接半径", (M * 0.125) / BODY_PX, CFG.PLAYER_SPD / BODY_DEG],
  ["台風速度t=0/自国外接半径", (M * 0.09) / BODY_PX, CFG.STORM_SPD0 / BODY_DEG],
  ["台風加速/自国外接半径", (M * 0.0035) / BODY_PX, CFG.STORM_ACC / BODY_DEG],
  ["プレイ窓幅/自国外接半径", ORIG.W / BODY_PX, CFG.PLAY_W / BODY_DEG],
  ["プレイ窓高/自国外接半径", ORIG.H / BODY_PX, CFG.PLAY_H / BODY_DEG],
  ["発生マージン/自国外接半径", 60 / BODY_PX, CFG.SPAWN_MARGIN / BODY_DEG],
  ["消滅マージン/自国外接半径", 150 / BODY_PX, CFG.DESPAWN_MARGIN / BODY_DEG],
  ["押しのけ余白/自国外接半径", 120 / BODY_PX, CFG.PUSH_MARGIN / BODY_DEG],
  ["滑走停止/自国外接半径", 0.5 / BODY_PX, CFG.SLIDE_CUTOFF / BODY_DEG],
];
for (const [name, a, b] of pairs) {
  check(name, Math.abs(a - b) < 1e-12, `元 ${a.toFixed(9)} : 球面 ${b.toFixed(9)}`);
}
near("§1b.1 の 3 つの比のうち 致死/本体 = 0.466821", ((M * 0.05 + M * 0.035) * ORIG.LETHAL) / BODY_PX, 0.466821, 1e-6);
near("§1b.1 の 3 つの比のうち 速度/本体 = 1.248185", (M * 0.125) / BODY_PX, 1.248185, 1e-6);
near("§1b.1 の 3 つの比のうち 窓幅/本体 = 5.705988", ORIG.W / BODY_PX, 5.705988, 1e-6);

// --- §1b.3 の表の値そのもの ---
section("§1b.3 の換算値");
near("A = 0.026501 度/元px", A, 0.026501, 1e-6);
near("自国の描画外接角半径 = 1.8577 度", BODY_DEG, 1.8577, 1e-4);
check("K_TW = 1.0（実寸）", K_TW === 1.0);
near("致死半径ピーク最大 = 0.8672 度", (CFG.R_PEAK_MIN + CFG.R_PEAK_RAND) * CFG.LETHAL, 0.8672, 1e-4);
near("致死半径ピーク最小 = 0.5101 度", CFG.R_PEAK_MIN * CFG.LETHAL, 0.5101, 1e-4);
near("プレイヤー速度 = 2.3188 度/秒", CFG.PLAYER_SPD, 2.3188, 1e-4);
near("台風速度 t=0 = 1.6695 度/秒", CFG.STORM_SPD0, 1.6695, 1e-4);
near("プレイ窓 幅 = 10.6003 度", CFG.PLAY_W, 10.6003, 1e-4);
near("プレイ窓 高 = 18.5505 度", CFG.PLAY_H, 18.5505, 1e-4);
near("カメラ PLAY 可視角半径 = 9.2753 度", CFG.CAM_PLAY, 9.2753, 1e-4);
near("カメラ FLOOR 可視角半径 = 4.6376 度", CFG.CAM_FLOOR, 4.6376, 1e-4);

// --- §1.6 の難度曲線 ---
section("難度曲線（§1.6）");
const stormSpd = (t) => CFG.STORM_SPD0 + t * CFG.STORM_ACC;
near("速度逆転は t = 10.0 ゲーム内日", (CFG.PLAYER_SPD - CFG.STORM_SPD0) / CFG.STORM_ACC, 10.0, 1e-6);
check("t=0 では台風のほうが遅い", stormSpd(0) < CFG.PLAYER_SPD, `${(stormSpd(0) / CFG.PLAYER_SPD).toFixed(3)} 倍`);
check("t=30 では台風のほうが速い", stormSpd(30) > CFG.PLAYER_SPD, `${(stormSpd(30) / CFG.PLAYER_SPD).toFixed(3)} 倍`);
near("t=30 の速度比 1.56 倍", stormSpd(30) / CFG.PLAYER_SPD, 1.56, 0.005);
const interval = (t) => Math.max(CFG.SPAWN_INTERVAL_MIN, CFG.SPAWN_INTERVAL0 - t * CFG.SPAWN_INTERVAL_DECAY);
near("発生間隔は t=0 で 4 秒", interval(0), 4, 1e-9);
near("発生間隔が下限 1.5 秒に張り付くのは t = 31.25 日", (CFG.SPAWN_INTERVAL0 - CFG.SPAWN_INTERVAL_MIN) / CFG.SPAWN_INTERVAL_DECAY, 31.25, 1e-9);
check("発生間隔は下限を下回らない", interval(1000) === CFG.SPAWN_INTERVAL_MIN);
check("同時数上限は 7", CFG.MAX_STORMS === 7);

// --- §1.4 進路パターン。元の定数そのままであることの回帰防止 ---
section("進路パターン（§1.4）— 元ゲームの定数と完全一致");
const EXPECTED = [
  ["STRAIGHT", 4, 7, 0.3, 0.2, 1.2, 0],
  ["ERRATIC", 0.7, 1.6, 2.4, 0.2, 0.9, 0],
  ["RECURVING", 1.5, 3, 0.3, 0.2, 1.0, 0],
  ["TRACKING", 1.5, 3, 0.6, 0.9, 0.8, 0],
  ["STALLING", 1.5, 3, 1.0, 0.4, 1.3, 0.5],
];
check("パターンは 5 種", PATTERNS.length === 5, `実際 ${PATTERNS.length}`);
for (const [id, segMin, segMax, jitter, pull, spd, stall] of EXPECTED) {
  const p = PATTERNS.find((x) => x.id === id);
  const ok = p && p.segMin === segMin && p.segMax === segMax && p.jitter === jitter && p.pull === pull && p.spd === spd && p.stall === stall;
  check(`${id} の 6 定数が一致`, ok, p ? JSON.stringify(p) : "見つからない");
}
check("RECURVING だけが bias を持つ", PATTERNS.filter((p) => p.biasRand).length === 1 && PATTERNS.find((p) => p.id === "RECURVING").biasRand === true);

// --- 元のまま維持すると決めたもの（§11.1-2） ---
section("元のまま維持すると決めた値");
check("開始日は 2026-08-01", CFG.START_DATE.join(",") === "2026,7,1");
check("スローモーションは 0.3 倍・1500 ms", CFG.SLOWMO === 0.3 && CFG.SLOWMO_MS === 1500);
check("dt の上限は 50 ms", CFG.DT_MAX === 0.05);
check("致死半径は外側の 0.55 倍", CFG.LETHAL === 0.55);

summary("config");
