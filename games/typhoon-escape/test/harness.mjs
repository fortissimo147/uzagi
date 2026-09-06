// 依存ゼロの極小テストハーネス（QSE本体の test-logic.mjs と同じ思想）。
let pass = 0;
let fail = 0;
const failures = [];

export function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
  return ok;
}

export function near(name, actual, expected, tol = 0.05) {
  return check(
    name,
    Math.abs(actual - expected) <= tol,
    `期待 ${expected}±${tol}、実際 ${Number(actual).toFixed(3)}`
  );
}

export function section(title) {
  console.log(`\n${title}`);
}

export function summary(title) {
  console.log(`\n${title}: ${pass} 件成功 / ${fail} 件失敗`);
  if (fail) {
    console.log("失敗一覧:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}
