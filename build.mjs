#!/usr/bin/env node
// Builds the browser bundle (SDK + tool manifest, viem inlined — no CDN) and the tool manifest.
import { build, transform } from "esbuild";
import fs from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest } from "./sdk/tools.js";
import { JS_BUDGET_BYTES, assertJavaScriptBudget } from "./scripts/js-budget.mjs";

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

// Home hero 3D hamster: three.js bundled into its own lazily imported module (never in the boot path).
await build({ entryPoints: ["web/hero3d-src.js"], outfile: "web/hero3d.js", bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true, legalComments: "none" });

const bytes = fs.statSync("web/bundle.js").size;
fs.writeFileSync("web/tools.json", `${JSON.stringify(buildManifest(), null, 2)}\n`);

// ── static output for Cloudflare Pages ───────────────
const OUT = "dist";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const file of ["_headers", "network.js", "network-strip.js", "browse-grid.js", "image-queue.js", "explore.js", "explore-index.js", "explore-chain.js", "explore-snapshot.js", "holder-routes.js", "holder-workspace.js", "holder-history.js", "merge-planner.js", "squeek-page.js", "earnings.js", "wallet.js", "wheel-feed.js", "holdings.js", "images.js", "theme.js", "index.html", "styles.css", "app.js", "telemetry.js", "activity.js", "components.js", "developers.js", "settings.js", "bundle.js", "hero3d.js", "share-card.js", "share-styles.js", "tools.json"]) {
  if(file.endsWith(".js") && file!=="bundle.js"&&file!=="hero3d.js") fs.writeFileSync(path.join(OUT,file),(await transform(fs.readFileSync(path.join("web",file),"utf8"),{minify:true,format:"esm",target:"es2022",legalComments:"none"})).code);
  else fs.copyFileSync(path.join("web", file), path.join(OUT, file));
}
// Phase 10 prescanned display snapshot(s), refreshed by .github/workflows/prescan.yml. Optional.
if (fs.existsSync(path.join("web", "snapshot"))) {
  fs.mkdirSync(path.join(OUT, "snapshot"), { recursive: true });
  for (const file of fs.readdirSync(path.join("web", "snapshot")).filter((f) => f.endsWith(".json"))) fs.copyFileSync(path.join("web", "snapshot", file), path.join(OUT, "snapshot", file));
}
fs.mkdirSync(path.join(OUT, "fonts"), { recursive: true });
for (const file of fs.readdirSync(path.join("web", "fonts")).filter((f) => f.endsWith(".woff2"))) {
  fs.copyFileSync(path.join("web", "fonts", file), path.join(OUT, "fonts", file));
}

// Build-time parity, never a reason to check generated dist/ into Git.
for (const file of ["_headers", "network.js", "network-strip.js", "browse-grid.js", "image-queue.js", "explore.js", "explore-index.js", "explore-chain.js", "explore-snapshot.js", "holder-routes.js", "holder-workspace.js", "holder-history.js", "merge-planner.js", "squeek-page.js", "earnings.js", "wallet.js", "wheel-feed.js", "holdings.js", "images.js", "theme.js", "index.html", "styles.css", "app.js", "telemetry.js", "activity.js", "components.js", "developers.js", "settings.js", "bundle.js", "hero3d.js", "share-card.js", "share-styles.js", "tools.json"]) {
  if (!file.endsWith(".js") && !fs.readFileSync(path.join("web", file)).equals(fs.readFileSync(path.join(OUT, file)))) throw new Error(`Static output mismatch: ${file}`);
}
const manifest = buildManifest();
process.stdout.write(
  `bundled web/bundle.js (${(bytes / 1024).toFixed(1)} KB) · ` +
    `web/tools.json (${manifest.tools.length} tools) · dist/ static site\n`,
);

// Sum independently gzipped JS responses, not a single artificially combined stream.
const scripts = fs.readdirSync(OUT).filter(file => file.endsWith('.js')).sort().map(file => {
  const source = fs.readFileSync(path.join(OUT, file));
  return { file, rawBytes: source.length, gzipBytes: gzipSync(source).length };
});
const size = { algorithm: 'gzip (Node default level)', scripts, totalGzipBytes: scripts.reduce((total, file) => total + file.gzipBytes, 0), budgetBytes: JS_BUDGET_BYTES };
fs.writeFileSync(path.join(OUT, 'js-size.json'), JSON.stringify(size, null, 2) + '\n');
assertJavaScriptBudget(size.totalGzipBytes);
console.log(`dist JavaScript gzip: ${size.totalGzipBytes.toLocaleString('en-US')} bytes / ${size.budgetBytes.toLocaleString('en-US')} byte budget (all ${scripts.length} scripts)`);
