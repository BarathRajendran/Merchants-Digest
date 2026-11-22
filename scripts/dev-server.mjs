// Local static server that honours vercel.json rewrites, so clean URLs work the same as production.
// Usage: node scripts/dev-server.mjs [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || process.argv[2] || 4173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".woff2": "font/woff2"
};

async function rewrites() {
  try {
    const config = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
    return new Map((config.rewrites || []).map((r) => [r.source, r.destination]));
  } catch {
    return new Map();
  }
}

createServer(async (req, res) => {
  try {
    let pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const map = await rewrites();
    if (map.has(pathname)) pathname = map.get(pathname);
    let file = path.join(root, pathname);
    if (!file.startsWith(root)) throw new Error("outside root");
    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      file = path.join(file, "index.html");
      info = await stat(file).catch(() => null);
    }
    if (!info && !path.extname(file)) {
      file += ".html";
      info = await stat(file).catch(() => null);
    }
    if (!info) {
      // Mirror Vercel: serve the generated 404 page when one exists.
      const notFound = await readFile(path.join(root, "404.html")).catch(() => null);
      res.writeHead(404, { "content-type": notFound ? types[".html"] : "text/plain" });
      res.end(notFound || `404 ${pathname}`);
      return;
    }
    res.writeHead(200, {
      "content-type": types[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(await readFile(file));
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(String(error));
  }
}).listen(port, () => console.log(`Merchants Digest dev server on http://localhost:${port}`));
