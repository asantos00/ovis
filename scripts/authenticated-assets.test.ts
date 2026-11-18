import { expect, test } from "bun:test";

import { authenticatedAssetsHtml } from "./authenticated-assets.ts";

test("the classic build carries an authenticating proxy's cookie on older Safari", () => {
  const page = authenticatedAssetsHtml(`
    <script type="module" crossorigin src="/assets/index.js"></script>
    <script type="module">window.modern = true</script>
    <link rel="modulepreload" crossorigin href="/assets/runtime.js">
    <link rel="stylesheet" crossorigin href="/assets/index.css">
    <link rel="manifest" crossorigin="use-credentials" href="/manifest.webmanifest">
    <script nomodule>window.safariFix = true</script>
    <script nomodule crossorigin id="vite-legacy-polyfill" src="/assets/polyfills-legacy.js"></script>
    <script nomodule crossorigin id="vite-legacy-entry" data-src="/assets/index-legacy.js">System.import(document.getElementById('vite-legacy-entry').getAttribute('data-src'))</script>
  `);

  expect(page.match(/crossorigin="use-credentials"/g)).toHaveLength(4);
  expect(page).toContain('id="vite-legacy-entry" data-src="/assets/index-legacy.js" src="/legacy-entry.js"');
  expect(page).not.toContain("System.import(document.getElementById");
  expect(page).not.toContain('type="module"');
  expect(page).not.toContain("modulepreload");
  expect(page).not.toContain("nomodule");
  expect(page).not.toContain("safariFix");
  expect(page).not.toMatch(/\bcrossorigin(?=[\s>])/);
});
