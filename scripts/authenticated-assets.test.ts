import { expect, test } from "bun:test";

import { authenticatedAssetsHtml } from "./authenticated-assets.ts";

test("Vite assets send an authenticating proxy's cookie on older Safari", () => {
  const page = authenticatedAssetsHtml(`
    <script type="module" crossorigin src="/assets/index.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/runtime.js">
    <link rel="stylesheet" crossorigin href="/assets/index.css">
    <link rel="manifest" crossorigin="use-credentials" href="/manifest.webmanifest">
  `);

  expect(page.match(/crossorigin="use-credentials"/g)).toHaveLength(4);
  expect(page).not.toMatch(/\bcrossorigin(?=[\s>])/);
});
