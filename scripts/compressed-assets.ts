import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants, gzip } from "node:zlib";
import type { Plugin } from "vite";

const brotli = promisify(brotliCompress), gz = promisify(gzip);

async function filesBelow(root: string): Promise<string[]> {
  const found: string[] = [];
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) found.push(path);
    }
  };
  await visit(root);
  return found;
}

/** Precompress only built static assets; request handling remains file streaming. */
export function compressedAssets(): Plugin {
  const outputs = new Set<string>();
  return {
    name: "compressed-static-assets",
    writeBundle(options) { if (options.dir) outputs.add(options.dir); },
    async closeBundle() {
      for (const output of outputs) {
        const paths = await filesBelow(output);
        // The legacy plugin writes modern and classic bundles in separate passes. Read the final
        // pages and files after both, so every entry file gets the startup compression level.
        const pages = await Promise.all(paths.filter((path) => path.endsWith(".html")).map((path) => readFile(path, "utf8")));
        const assets = paths.filter((path) => path.startsWith(`${join(output, "assets")}${sep}`) && /\.(?:js|css|wasm)$/.test(path));
        await Promise.all(assets.map(async (path) => {
          const fileName = relative(output, path).replaceAll("\\", "/");
          const bytes = await readFile(path);
          const quality = pages.some((html) => html.includes(fileName)) ? 11 : 5;
          const [br, zipped] = await Promise.all([
            brotli(bytes, { params: { [constants.BROTLI_PARAM_QUALITY]: quality } }),
            gz(bytes, { level: 9 }),
          ]);
          await Promise.all([writeFile(`${path}.br`, br), writeFile(`${path}.gz`, zipped)]);
        }));
      }
    },
  };
}
