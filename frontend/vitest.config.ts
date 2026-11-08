import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    // e2e/*.spec.ts are Playwright specs (run via playwright), not vitest.
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});