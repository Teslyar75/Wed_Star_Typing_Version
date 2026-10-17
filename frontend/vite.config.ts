import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf-8")) as { version: string };

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(pkg.version),
  },
  optimizeDeps: {
    exclude: ["vosk-browser"],
  },
  server: {
    port: 5173,
    fs: { allow: [root, path.resolve(root, "..")] },
    proxy: {
      "/api": "http://127.0.0.1:8000",
    },
  },
  test: {
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/e2e/**", "**/dist/**"],
  },
});
