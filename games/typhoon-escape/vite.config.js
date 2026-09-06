import { defineConfig } from "vite";

// 既存の Tower of Green Pillars と同じ、どこに置いても動く素の Vite 構成。
export default defineConfig({
  base: "./",
  build: { target: "es2020" },
});
