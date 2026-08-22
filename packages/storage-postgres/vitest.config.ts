import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    // 20s, not vitest's 5s default.
    //
    // This suite talks to a real Postgres: it takes advisory locks that are
    // meant to wait for another connection, and it runs trigram searches. Under
    // a full parallel repo run those legitimately crossed 5s — three cases
    // failed at 5.0-5.4s, which reads as a product fault and is a budget one.
    // The sibling database suites already allow 10-30s (spi-conformance,
    // integration, pilot-scenarios). A genuine hang still fails, just later.
    testTimeout: 20_000,
    // Integration tests share a single Postgres database and must not run
    // concurrently to avoid table-drop / schema conflicts.
    fileParallelism: false,
  },
});
