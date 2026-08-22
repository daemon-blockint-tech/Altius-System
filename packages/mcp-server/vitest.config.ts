import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // The package had no config at all, so every case ran on vitest's 5s
    // default. That is what turned a slow module load in one test into a
    // failure at 5133ms under a full parallel run — a flake with a real cause,
    // fixed at the cause, but the budget was never chosen for a suite that
    // builds servers and executes actions.
    testTimeout: 10_000,
  },
});
