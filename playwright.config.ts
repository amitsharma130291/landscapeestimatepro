import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4329",
    trace: "retain-on-failure",
    // /app is gated behind a license (LicenseGate.tsx) now that Dodo
    // checkout is live. Every existing test that exercises the Pro app
    // assumes it's already open, not the activation screen — so every
    // test starts with a fixture license already in localStorage by
    // default. Tests that specifically cover the gate/activation/recovery
    // flow (tests/e2e/license-gate.spec.ts) opt back OUT with
    // `test.use({ storageState: { cookies: [], origins: [] } })`.
    storageState: "tests/e2e/.auth/licensed-state.json",
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
