// Boot smoke: every relative module import in dist/ must resolve to a file inside dist/.
// A missing file makes Cloudflare Pages serve index.html (text/html) and the app never boots.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const dist = path.resolve('dist');
assert.ok(fs.existsSync(path.join(dist, 'index.html')), 'run npm run build first');
const bad = [];
const files = fs.readdirSync(dist).filter(f => f.endsWith('.js'));
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
for (const m of html.matchAll(/<script[^>]+src="(\.\/[^"]+)"/g)) if (!fs.existsSync(path.join(dist, m[1]))) bad.push(`index.html -> ${m[1]}`);
for (const f of files) {
  const src = fs.readFileSync(path.join(dist, f), 'utf8');
  for (const m of src.matchAll(/(?:from\s*|import\s*\(\s*|import\s+)["'](\.{1,2}\/[^"']+)["']/g)) {
    const target = path.resolve(dist, m[1]);
    if (!target.startsWith(dist + path.sep) || !fs.existsSync(target)) bad.push(`${f} -> ${m[1]}`);
  }
}
// Named imports from the bundle must exist: a missing export is a SyntaxError that kills the whole module.
const bundle = await import(new URL('file://' + path.join(dist, 'bundle.js')).href).catch(() => null);
if (bundle) for (const f of files) {
  const src = fs.readFileSync(path.join(dist, f), 'utf8');
  for (const m of src.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']\.\/bundle\.js["']/g))
    for (const part of m[1].split(',').map(x => x.trim()).filter(Boolean)) {
      const name = part.split(/\s+as\s+/)[0].trim();
      if (!(name in bundle)) bad.push(`${f} imports missing bundle export ${name}`);
    }
}
assert.deepEqual(bad, [], `unresolvable module imports in dist/: ${bad.join(', ')}`);
console.log(`PASS dist imports: ${files.length} scripts, every relative import resolves inside dist/`);
