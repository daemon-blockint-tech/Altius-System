import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
    testTimeout: 10_000,
    // One database, several files: run them one at a time.
    //
    // Each Postgres file bootstraps its own schema, and applySchema's platform
    // DDL includes statements like
    //   ALTER TABLE "dataset"."rows" ADD COLUMN IF NOT EXISTS "row_key" ...
    // which needs an ACCESS EXCLUSIVE lock on a table another file is
    // concurrently writing to. Postgres resolves the cycle by aborting one
    // side with "deadlock detected", so a file that did nothing wrong fails.
    //
    // Serialising the files is the fix at this level: an advisory lock only
    // orders DDL against other DDL, and this is DDL against DML. The suite is
    // dominated by one long file, so wall-clock is barely affected.
    //
    // The same shape exists in production — a pod booting and running platform
    // DDL while another serves traffic — and cannot be fixed here. See the PR
    // that added this comment.
    fileParallelism: false,
  },
});
