#!/usr/bin/env node
// Builds the browser bundle (SDK + tool manifest, viem inlined — no CDN) and the tool manifest.
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest } from "./sdk/tools.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
process.chdir(ROOT);

const result = await build({
  entryPoints: ["sdk/browser-entry.js"],
  outfile: "web/bundle.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  minify: true,
  legalComments: "none",
  metafile: true,
});

const bytes = fs.statSync("web/bundle.js").size;
fs.writeFileSync("web/tools.json", `${JSON.stringify(buildManifest(), null, 2)}\n`);

// ── static output for Vercel / Cloudflare Pages / GitHub Pages ───────────────
const OUT = "dist";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const file of ["index.html", "styles.css", "app.js", "bundle.js", "tools.json"]) {
  fs.copyFileSync(path.join("web", file), path.join(OUT, file));
}
fs.mkdirSync(path.join(OUT, "fonts"), { recursive: true });
for (const file of fs.readdirSync(path.join("web", "fonts")).filter((f) => f.endsWith(".woff2"))) {
  fs.copyFileSync(path.join("web", "fonts", file), path.join(OUT, "fonts", file));
}

const manifest = buildManifest();
process.stdout.write(
  `bundled web/bundle.js (${(bytes / 1024).toFixed(1)} KB) · ` +
    `web/tools.json (${manifest.tools.length} tools) · dist/ static site\n`,
);
