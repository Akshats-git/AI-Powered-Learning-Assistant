import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.js"],
    testTimeout: 20000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
