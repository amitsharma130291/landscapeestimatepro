import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4329",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run preview -- --port 4329",
    url: "http://localhost:4329",
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Firefox/WebKit only run the tagged @smoke subset (see
    // tests/e2e/cross-browser.spec.ts) — WebKit here is Playwright's own
    // WebKit build, NOT real Safari; that remains a separate manual
    // requirement (see the QA workbook, LEP-142).
    { name: "firefox", testMatch: /cross-browser\.spec\.ts/, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", testMatch: /cross-browser\.spec\.ts/, use: { ...devices["Desktop Safari"] } },
  ],
});
