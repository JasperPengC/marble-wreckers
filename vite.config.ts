import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "public",
  // host: true binds 0.0.0.0 so phones on the same LAN can open the game.
  server: { host: true, port: 5194, strictPort: true },
  // Serves dist/web (the standalone H5 build) after `bun run build:h5`.
  preview: { host: true, port: 5195, strictPort: true },
  plugins: [
    {
      name: "demo-body",
      transformIndexHtml(html) {
        return html.replace(
          "<!--app-->",
          readFileSync(new URL("./src/template.html", import.meta.url), "utf8")
        );
      },
    },
  ],
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
    target: "es2022",
    minify: false,
    sourcemap: process.env.MINI_APP_DEBUG === "1" ? "inline" : false,
    cssCodeSplit: false,
    lib: {
      entry: fileURLToPath(new URL("./src/main.ts", import.meta.url)),
      name: "ChaiLouDanzhu",
      formats: ["iife"],
      fileName: () => "app.js",
      cssFileName: "app",
    },
  },
});
