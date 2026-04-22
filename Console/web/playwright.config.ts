import { defineConfig, devices } from "@playwright/test";

const webBaseURL = process.env.FF_CONSOLE_E2E_BASE_URL ?? "http://127.0.0.1:4173";
const apiBaseURL = process.env.FF_CONSOLE_E2E_API_URL ?? "http://127.0.0.1:8787";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: webBaseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure"
  },
  reporter: [["list"], ["html", { open: "never" }]],
  metadata: {
    apiBaseURL
  },
  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome"
      }
    }
  ]
});
