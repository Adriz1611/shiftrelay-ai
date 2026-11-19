import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  use: { baseURL: "http://127.0.0.1:3167", channel: "chrome" },
  webServer: {
    command: "node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3167",
    url: "http://127.0.0.1:3167",
    timeout: 45000,
  },
});
