import type { Plugin } from "vite";

/**
 * Older WebKit omits same-origin cookies from module fetches unless the entry explicitly asks for
 * credentials. Ovis is commonly served behind an authenticating proxy, so every Vite-generated
 * script, preload and stylesheet must carry the proxy cookie on Safari 12 too.
 */
export function authenticatedAssetsHtml(html: string): string {
  return html
    // The legacy plugin's inline System.import is refused by Ovis's script-src 'self' policy.
    .replace(/<script([^>]*\bid="vite-legacy-entry"[^>]*)>System\.import\([^<]+<\/script>/,
      '<script$1 src="/legacy-entry.js"></script>')
    // Every Ovis client takes the classic build. Safari 12 otherwise claims module support, then
    // loses the authenticating proxy cookie while fetching the module graph.
    .replace(/\s*<script\b[^>]*\btype="module"[^>]*>[\s\S]*?<\/script>/g, "")
    .replace(/\s*<script\s+nomodule>(?:(?!<\/script>)[\s\S])*<\/script>/g, "")
    .replace(/\s*<link\b[^>]*\brel="modulepreload"[^>]*>/g, "")
    .replace(/\snomodule(?=[\s>])/g, "")
    .replace(/\bcrossorigin(?=[\s>])/g, 'crossorigin="use-credentials"');
}

export const authenticatedAssets = (): Plugin => ({
  name: "authenticated-assets",
  transformIndexHtml: { order: "post", handler: authenticatedAssetsHtml },
});
