// Product Page Checker: GET /api/check-product-page?url=<product page URL>
// Fetches one public Shopify product page and runs the same checks as the Merchants Digest
// product page research (lib/pdp-checks.mjs). Nothing is stored.
//
// Safety: http(s) only, standard ports only, hostnames that resolve to public IP addresses only
// (checked again on every redirect), at most 3 redirects, 10 second timeout, 4 MB response cap.

import { lookup } from "node:dns/promises";
import net from "node:net";
import { analyzeProductPage, isShopifyHtml } from "../lib/pdp-checks.mjs";

const UA = "Mozilla/5.0 (compatible; MerchantsDigestChecker/1.0; +https://www.merchantsdigest.com/tools/product-page-checker)";
const MAX_BYTES = 4 * 1024 * 1024;
const TIMEOUT_MS = 10000;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("ff");
}

async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UserError("That does not look like a web address.");
  }
  if (!/^https?:$/.test(url.protocol)) throw new UserError("Use an http or https address.");
  if (url.port && !["80", "443"].includes(url.port)) throw new UserError("Use a standard web address without a port number.");
  if (url.username || url.password) throw new UserError("Remove any username or password from the address.");
  const host = url.hostname;
  if (net.isIP(host) || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new UserError("Use your store's public web address.");
  }
  const addresses = await lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw new UserError("We could not find that website.");
  if (addresses.some((a) => isPrivateIp(a.address))) throw new UserError("Use your store's public web address.");
  return url;
}

class UserError extends Error {}

async function fetchPublic(rawUrl) {
  let url = await assertPublicUrl(rawUrl);
  for (let hop = 0; hop <= 3; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { redirect: "manual", signal: ctrl.signal, headers: { "user-agent": UA, accept: "text/html" } });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = await assertPublicUrl(new URL(res.headers.get("location"), url).toString());
        continue;
      }
      if (!res.ok) throw new UserError(`The page returned an error (${res.status}). Check the address and try again.`);
      const reader = res.body.getReader();
      const chunks = [];
      let size = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BYTES) {
          await reader.cancel();
          throw new UserError("That page is too large to check.");
        }
        chunks.push(value);
      }
      return { url, html: Buffer.concat(chunks).toString("utf8") };
    } catch (error) {
      if (error instanceof UserError) throw error;
      throw new UserError(error.name === "AbortError" ? "The page took too long to respond." : "We could not reach that page.");
    } finally {
      clearTimeout(timer);
    }
  }
  throw new UserError("That address redirects too many times.");
}

export default async function handler(req, res) {
  res.setHeader("cache-control", "no-store");
  res.setHeader("content-type", "application/json; charset=utf-8");
  const send = (status, body) => {
    res.statusCode = status;
    res.end(JSON.stringify(body));
  };
  if (req.method !== "GET") return send(405, { error: "Use GET." });

  const input = String(new URL(req.url, "http://x").searchParams.get("url") || "").trim().slice(0, 500);
  if (!input) return send(400, { error: "Paste the address of one of your product pages." });
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;

  try {
    let { url, html } = await fetchPublic(withScheme);
    if (!isShopifyHtml(html)) return send(422, { error: "This checker works with Shopify stores, and that page does not look like one." });

    // If they pasted a homepage or collection, follow the first product link on it.
    if (!/\/products\/[^/?#]+/.test(url.pathname)) {
      const skip = /gift|e-?card|sample|swatch|insurance|warranty|shipping-protection|donation/i;
      const links = [...html.matchAll(/href=["'](\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:collections\/[^"'/]+\/)?products\/[^"'#?]+)["']/gi)].map((m) => m[1]);
      const link = links.find((l) => !skip.test(l)) || links[0];
      if (!link) return send(422, { error: "Paste the address of a product page (it usually contains /products/)." });
      ({ url, html } = await fetchPublic(new URL(link, url).toString()));
    }

    const host = url.hostname.replace(/^www\./, "");
    const result = analyzeProductPage(html, host);
    return send(200, {
      checkedUrl: url.toString(),
      checkedAt: new Date().toISOString(),
      ...result,
      pdp: { ...result.pdp, deliveryMatch: undefined, returnsMatch: undefined }
    });
  } catch (error) {
    if (error instanceof UserError) return send(422, { error: error.message });
    return send(500, { error: "Something went wrong on our side. Please try again." });
  }
}
