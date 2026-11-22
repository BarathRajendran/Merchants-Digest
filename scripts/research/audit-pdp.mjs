// Merchants Digest research: audit public Shopify product pages for buyer-facing and machine-readable signals.
//
// Usage: node scripts/research/audit-pdp.mjs research-data/<study>/candidates.txt
// Output: research-data/<study>/raw.json, one record per store.
//
// Privacy: research-data/ is gitignored and never deployed. Published reports use only aggregate
// figures; no store name, domain or URL leaves research-data/.
//
// What it checks (server-rendered HTML only; widgets injected later by JavaScript are not seen,
// so results are a lower bound for text-based checks):
//   - store is on Shopify, and one in-stock product page is reachable
//   - delivery timeframe, returns terms and size guidance stated on the product page
//   - review signals (structured rating or a known review app)
//   - Product structured data and which fields it includes (offers, brand, GTIN, rating,
//     shipping details, return policy)
//   - third-party script hosts loaded by the product page, and HTML size
//   - robots.txt rules for AI crawlers, refund and shipping policy pages, /llms.txt
// Polite: a few requests per store, limited concurrency, short timeouts.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeProductPage, isShopifyHtml, robotsBlocks, visibleText } from "../../lib/pdp-checks.mjs";

const listPath = process.argv[2];
if (!listPath) throw new Error("Pass the candidates.txt path");
const outDir = path.dirname(listPath);
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const CONCURRENCY = 5;

const domains = [...new Set((await readFile(listPath, "utf8")).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")))];

async function get(url, { timeout = 15000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/json;q=0.9,*/*;q=0.8" }, redirect: "follow", signal: ctrl.signal });
    const text = await res.text();
    return { ok: res.ok, status: res.status, url: res.url, text, type: res.headers.get("content-type") || "" };
  } catch (error) {
    return { ok: false, status: 0, url, text: "", error: String(error.name || error) };
  } finally {
    clearTimeout(timer);
  }
}

async function findProductUrl(origin, homeHtml) {
  const pj = await get(`${origin}/products.json?limit=10`);
  if (pj.ok && pj.type.includes("json")) {
    try {
      const products = JSON.parse(pj.text).products || [];
      // Skip gift cards, samples, add-ons and similar non-representative items.
      const skip = /gift|e-?card|sample|swatch|insurance|warranty|route|shipping protection|donation|bundle|add-?on|sticker|cleaner/i;
      const real = products.filter((p) => !skip.test(`${p.handle} ${p.title} ${p.product_type || ""}`));
      const pool = real.length ? real : products;
      const pick = pool.find((p) => (p.variants || []).some((v) => v.available)) || pool[0];
      if (pick) return { url: `${origin}/products/${pick.handle}`, via: "products.json" };
    } catch {
      /* fall through */
    }
  }
  const m = homeHtml.match(/href=["'](\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:collections\/[^"'/]+\/)?products\/[^"'#?]+)["']/i);
  if (m) return { url: `${origin}${m[1]}`, via: "homepage link" };
  return null;
}

async function audit(domain) {
  const record = { domain, auditedAt: new Date().toISOString() };
  const home = await get(`https://${domain}/`);
  if (!home.ok) return { ...record, status: "unreachable", http: home.status, error: home.error };
  const origin = new URL(home.url).origin;
  record.finalOrigin = origin;
  const isShopify = isShopifyHtml(home.text);
  if (!isShopify) return { ...record, status: "not-shopify" };

  const product = await findProductUrl(origin, home.text);
  if (!product) return { ...record, status: "no-product" };
  const pdp = await get(product.url);
  if (!pdp.ok || pdp.text.length < 2000) return { ...record, status: "pdp-blocked", http: pdp.status };

  const host = new URL(origin).hostname.replace(/^www\./, "");
  const analysis = analyzeProductPage(pdp.text, host);

  const [robots, refund, shipping, llms] = await Promise.all([
    get(`${origin}/robots.txt`),
    get(`${origin}/policies/refund-policy`),
    get(`${origin}/policies/shipping-policy`),
    get(`${origin}/llms.txt`)
  ]);

  return {
    ...record,
    status: "ok",
    productUrl: product.url,
    productFoundVia: product.via,
    ...analysis,
    robots: { fetched: robots.ok, aiBotsBlocked: robots.ok ? robotsBlocks(robots.text) : [] },
    policies: {
      refund: refund.ok && visibleText(refund.text).length > 600,
      shipping: shipping.ok && visibleText(shipping.text).length > 600
    },
    llmsTxt: llms.ok && !/<html/i.test(llms.text.slice(0, 500)) && llms.text.trim().length > 20
  };
}

const results = [];
let index = 0;
async function worker() {
  while (index < domains.length) {
    const domain = domains[index++];
    const r = await audit(domain);
    results.push(r);
    process.stdout.write(`${r.status.padEnd(12)} ${domain}\n`);
    await new Promise((res) => setTimeout(res, 400));
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
results.sort((a, b) => a.domain.localeCompare(b.domain));
await writeFile(path.join(outDir, "raw.json"), `${JSON.stringify(results, null, 2)}\n`);
const counts = results.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {});
console.log("\nstatus counts:", counts);
