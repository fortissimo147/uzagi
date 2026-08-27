// 自動操作の共通部品。play.test.mjs（1面）と stages.test.mjs（2面以降）が使う。
// 「目標へ走り、崖の縁や段差の手前で跳ぶ」だけの簡易AIで、
// 区間がジャンプでつながっているかを機械的に確かめるためのもの。
import { check } from "./harness.mjs";

export async function installAutopilot(page) {
  await page.evaluate(() => {
    // 目標へ走り、崖の縁または段差の手前でジャンプする簡易AI
    window.__auto = async (tx, ty, tz, seconds) => {
      const g = window.__game;
      const p = g.player;
      const i = g.input;
      i.stick.active = true;
      i.touchJump = true;
      // 実時間ではなくゲーム内時間（g.time）で数える。描画が重い環境でも
      // 「ゲーム内で何秒ぶん動かしたか」が変わらないようにするため。
      // ただし落下などで g.time が止まったまま抜けられなくなるので、
      // 実時間の上限も併せて持たせておく。
      const t0 = g.time;
      const wall0 = performance.now();
      let best = Infinity;
      let lastJump = -1;
      while (g.time - t0 < seconds && performance.now() - wall0 < seconds * 4000) {
        const now = g.time;
        const dx = tx - p.pos.x;
        const dz = tz - p.pos.z;
        const d = Math.hypot(dx, dz);
        best = Math.min(best, Math.hypot(dx, ty - p.pos.y, dz));
        g.camera3.yaw = Math.atan2(-dx, -dz);
        i.stick.x = 0;
        i.stick.y = d < 1.6 ? 0 : -1;
        const needUp = ty > p.pos.y + 0.5;
        const fx = dx / (d || 1);
        const fz = dz / (d || 1);
        const ahead = g.world.groundAt(p.pos.x + fx * 1.5, p.pos.z + fz * 1.5, p.pos.y + 0.5, 0.2);
        const gap = !isFinite(ahead.y) || ahead.y < p.pos.y - 1;
        if (p.grounded && now - lastJump > 0.5 && (gap || (needUp && d < 3) || (!needUp && d > 1.6 && d < 2.4))) {
          i.touchJumpEdge = true;
          lastJump = now;
        }
        await new Promise((r) => requestAnimationFrame(r));
        if (d < 1.6 && Math.abs(p.pos.y - ty) < 1.2 && p.grounded) break;
      }
      i.stick.active = false;
      i.stick.x = i.stick.y = 0;
      i.touchJump = false;
      return { x: p.pos.x, y: p.pos.y, z: p.pos.z, best: +best.toFixed(2) };
    };
  });
}

/**
 * 区間を順に走らせる。segments は
 *   [名前, 開始地点, [経由地…], 制限秒]
 * の並び。開始地点に瞬間移動してから、経由地を順にたどる。
 */
export async function runSegments(page, segments) {
  for (const [name, from, waypoints, secs] of segments) {
    await page.evaluate(
      ([f]) => {
        const g = window.__game;
        g.state = "play";
        g.hud.hideAll();
        g.player.pos.set(f[0], f[1], f[2]);
        g.player.checkpoint.set(f[0], f[1], f[2]); // 失敗しても同じ区間をやり直す
        g.player.vel.set(0, 0, 0);
        g.player.hp = 3;
        g.player.dead = false;
        g.player.invuln = 999; // 到達性だけを見たいので無敵
        g.camera3.reset(g.player);
      },
      [from]
    );
    await page.waitForTimeout(400);
    let last = null;
    for (const w of waypoints)
      last = await page.evaluate((a) => window.__auto(a[0], a[1], a[2], a[3]), [...w, secs]);
    const t = waypoints[waypoints.length - 1];
    // 最後の区間では行き過ぎて土管に乗り、そのままクリアしてしまうことがある。
    // 目的は「そこまで行けるか」なので、クリアしたなら到達とみなす。
    const cleared = await page.evaluate(() => window.__game.state === "clear");
    const reached =
      cleared ||
      (Math.hypot(last.x - t[0], last.z - t[2]) < 3 && Math.abs(last.y - t[1]) < 2.6) ||
      last.best < 2.2;
    check(
      `${name} を自動操作で越えられる`,
      reached,
      `到達 (${last.x.toFixed(1)}, ${last.y.toFixed(1)}, ${last.z.toFixed(1)}) 最接近 ${last.best}`
    );
  }
}
