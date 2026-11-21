import { defineConfig } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
process.env.SHIFTRELAY_BROWSER_DB ??= join(
  tmpdir(),
  "shiftrelay-browser-" + randomUUID() + ".sqlite",
);
process.env.SHIFTRELAY_BROWSER_SECRET ??= randomUUID();
process.env.SHIFTRELAY_TEST_HOOK ??= randomUUID();
export default defineConfig({
  // These operator journeys share one workspace command stream and SQLite file.
  workers: 1,
  testDir: "./tests/browser",
  use: { baseURL: "http://127.0.0.1:3167", channel: "chrome" },
  webServer: {
    env: {
      DATABASE_PATH: process.env.SHIFTRELAY_BROWSER_DB,
      SESSION_SECRET: process.env.SHIFTRELAY_BROWSER_SECRET,
      GITHUB_WEBHOOK_SECRET: process.env.SHIFTRELAY_TEST_HOOK,
      GITHUB_REPOSITORY: "fixture/shiftrelay-browser",
      GITHUB_TOKEN: "fixture-only",
    },
    command: "node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3167",
    url: "http://127.0.0.1:3167",
    timeout: 45000,
  },
});
