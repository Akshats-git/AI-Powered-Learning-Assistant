import { defineConfig } from "@playwright/test";

// Backend and frontend are started, health-checked, and torn down by run.mjs
// (which also spins up an ephemeral in-memory MongoDB) rather than
// Playwright's own `webServer` option — that keeps the ordering (Mongo up
// before the API, API up before the frontend) explicit and easy to debug,
// instead of relying on undocumented startup-ordering between globalSetup
// and webServer.
export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.FRONTEND_URL,
    trace: "retain-on-failure",
  },
});
