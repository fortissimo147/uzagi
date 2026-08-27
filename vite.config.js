import { defineConfig } from "vite";

// QSE本体と同じく、Cloudflare Pages に dist/ をそのまま配信させる素のVite構成。
export default defineConfig({
  base: "./",
  build: { target: "es2020" },
});
