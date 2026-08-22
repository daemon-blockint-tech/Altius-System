import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // 15s, not vitest's 5s default: these cases boot gateways and agent
    // runtimes, and two of them crossed 5s under a full parallel repo run.
    testTimeout: 15_000,
  },
});
