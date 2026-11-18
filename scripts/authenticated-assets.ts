import type { Plugin } from "vite";

/**
 * Older WebKit omits same-origin cookies from module fetches unless the entry explicitly asks for
 * credentials. Ovis is commonly served behind an authenticating proxy, so every Vite-generated
 * script, preload and stylesheet must carry the proxy cookie on Safari 12 too.
 */
export function authenticatedAssetsHtml(html: string): string {
  return html.replace(/\bcrossorigin(?=[\s>])/g, 'crossorigin="use-credentials"');
}

export const authenticatedAssets = (): Plugin => ({
  name: "authenticated-assets",
  transformIndexHtml: { order: "post", handler: authenticatedAssetsHtml },
});
