#!/usr/bin/env node
/* ORBITx extension preview server.
 * Serves the extension popup in a normal browser tab so you can preview
 * the UI without loading it as an unpacked extension.
 *
 *   node preview-server.js            -> http://localhost:4173
 *   http://localhost:4173/?mock=repo  -> repo popup with sample data
 *   http://localhost:4173/?mock=user  -> profile popup with sample data
 *   http://localhost:4173/live.html   -> popup hitting the real GitHub API
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 4173;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

/* Live-preview harness: same popup, but popup.js's chrome.tabs call is
 * stubbed with a real github.com URL taken from ?url= (default: a repo). */
const LIVE_HTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>ORBITx Peek — live preview</title>
<style>body{font-family:system-ui;background:#f4f7fe;margin:0;padding:24px;color:#1b2559}
h1{font-size:16px}code{background:#e2e8f0;padding:1px 5px;border-radius:4px}
.frame{width:360px;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(27,37,89,.18)}</style>
</head><body>
<h1>ORBITx Peek — live preview</h1>
<p>The popup below queries the real GitHub API. Change target with <code>?url=https://github.com/owner/repo</code>.</p>
<iframe class="frame" style="width:360px;height:560px;border:0" src="/popup.html?live=1"></iframe>
<script>
  // popup.js inside the iframe asks for ?live=1; we pass the target via postMessage.
  const target = new URLSearchParams(location.search).get("url") || "https://github.com/vercel/next.js";
  const f = document.querySelector("iframe");
  f.addEventListener("load", () => f.contentWindow.postMessage({ orbitxTarget: target }, "*"));
</script>
</body></html>`;

function serveFile(res, file) {
  const full = path.join(ROOT, path.normalize(file).replace(/^(\.\.[\/\\])+/, ""));
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "text/plain" });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  if (u.pathname === "/" || u.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(LIVE_HTML);
  }
  if (u.pathname === "/live.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(LIVE_HTML);
  }
  serveFile(res, u.pathname.slice(1));
});

server.listen(PORT, () => {
  console.log(`ORBITx extension preview -> http://localhost:${PORT}`);
  console.log(`  mock repo popup : http://localhost:${PORT}/popup.html?mock=repo`);
  console.log(`  mock user popup : http://localhost:${PORT}/popup.html?mock=user`);
  console.log(`  live GitHub API : http://localhost:${PORT}/live.html?url=https://github.com/owner/repo`);
});
