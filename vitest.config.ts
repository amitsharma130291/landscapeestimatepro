import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // tests/e2e is a separate Playwright suite (run via `npm run test:e2e`) — Playwright's
    // test()/expect() are incompatible with Vitest's collector and must not be picked up here.
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
    environment: "jsdom",
  },
});
