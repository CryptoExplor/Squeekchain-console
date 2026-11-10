#!/usr/bin/env node
// Tiny static server for the web app. No deps, no build step beyond `node build.mjs`.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
// Match Cloudflare Pages in local/mock-browser tests too.
const securityHeaders=Object.fromEntries(fs.readFileSync(path.join(DIR,'_headers'),'utf8').split('\n').filter(line=>/^\s+[^:]+:/.test(line)).map(line=>{
  const colon=line.indexOf(':');return [line.slice(0,colon).trim(),line.slice(colon+1).trim()];
}));
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  for(const [name,value] of Object.entries(securityHeaders))res.setHeader(name,value);
  let url, relative;
  try {
    // Host is untrusted request input, not a base URL or filesystem authority.
    if (!req.url?.startsWith('/')) throw new Error('Invalid request target');
    url = new URL(req.url, 'http://static.invalid');
    relative = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    if (relative.includes('\0')) throw new Error('Invalid path');
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('bad request');
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" }).end("method not allowed");
    return;
  }
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
    return;
  }

  const file = path.resolve(DIR, `.${relative}`);
  if (file !== DIR && !file.startsWith(DIR + path.sep)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  fs.readFile(file, (err, body) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain" }).end(`not found: ${relative}`);
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
      // The page only talks to an RPC + the injected wallet; no cookies, no third-party scripts.
      "x-content-type-options": "nosniff",
    });
    res.end(req.method === "HEAD" ? undefined : body);
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Wheelhouse on http://${HOST}:${server.address().port}\n`);
});
