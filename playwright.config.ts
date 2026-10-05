import { defineConfig, devices } from "@playwright/test";

/**
 * Browser checks that a unit test cannot make. Today that is one: the frozen
 * landing page (spec 0018, AC-1), compared against screenshots taken before
 * the landing look reached the rest of the app.
 *
 * Runs against a dev server already on port 3000 when there is one, and
 * starts one otherwise. `PLAYWRIGHT_BASE_URL` points it somewhere else.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  expect: {
    // Antialiasing differs a hair between runs; a real change is far bigger.
    toHaveScreenshot: { maxDiffPixelRatio: 0.002 },
  },
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    // The finished page with nothing mid reveal, so a screenshot is the same every run.
    reducedMotion: "reduce",
    timezoneId: "Asia/Manila",
    locale: "en-PH",
  },
  webServer: {
    command: "npm run dev",
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
