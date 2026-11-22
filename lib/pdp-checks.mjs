// Shared product page checks used by the research audit (scripts/research/audit-pdp.mjs)
// and the public Product Page Checker (api/check-product-page.js). One implementation means
// the checker measures a page exactly the way the published research did.

export const visibleText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

export const RX = {
  delivery: /(ships?|shipped|dispatch(?:es|ed)?|deliver(?:y|ed|s)?|arrives?|get it by|estimated delivery)[^.]{0,50}?(\b\d{1,2}\s*(?:-|–|to)\s*\d{1,2}\b|\b\d{1,2}\b)\s*(?:business |working )?days?|get it by|estimated delivery|order (?:now|today|within)[^.]{0,30}(?:get|receive|arrive|ship)|ships (?:today|tomorrow|next business day)/i,
  returns: /free returns|\b\d{2,3}[- ]day (?:returns?|exchanges?|return policy|money[- ]back)|returns? (?:within|up to) \d+|easy returns|free exchanges?|exchanges? within \d+|hassle[- ]free returns|returns? (?:are )?free/i,
  size: /size (?:guide|chart)|fit guide|find (?:your|my) size|true to size|runs (?:small|large|big)|model is wearing|model wears|fit finder|sizing (?:guide|help)/i
};

// Widget-specific markers only. Generic mentions (for example an app listed in Shopify web-pixel
// settings) are not counted, because an installed pixel does not mean reviews are shown.
export const REVIEW_APPS = {
  "judge.me": /judge\.me\/|jdgm-(?:widget|preview|prev-badge|rev-widg)/i,
  Yotpo: /cdn-widgetsrepository\.yotpo\.com|staticw2\.yotpo\.com|class="[^"]*yotpo-(?:widget|bottomline|reviews|main-widget)/i,
  Okendo: /cdn-static\.okendo\.io|data-oke-(?:widget|reviews|star-rating)|oke-(?:sr|w-reviews)/i,
  Stamped: /cdn1\.stamped\.io|stamped-main-widget|stamped-product-reviews-badge/i,
  Loox: /loox\.io\/widget|loox-rating/i,
  "Reviews.io": /widget\.reviews\.io|reviewsio-(?:carousel|product)/i,
  Junip: /widgets\.juniphq\.com|junip-(?:product-review|store-key|star-ratings)/i,
  Trustpilot: /widget\.trustpilot\.com|trustpilot-widget/i,
  Bazaarvoice: /apps\.bazaarvoice\.com|display\.ugc\.bazaarvoice\.com/i,
  PowerReviews: /ui\.powerreviews\.com/i,
  "Shopify Product Reviews": /spr-badge|id="shopify-product-reviews"/i,
  Fera: /cdn\.fera\.ai/i
};

export const AI_BOTS = ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot", "anthropic-ai", "Google-Extended", "CCBot", "Applebot-Extended", "Bytespider"];

export function robotsBlocks(robots) {
  // Group "User-agent" lines with their following rules; a bot is blocked if its group (or a group listing it) disallows "/".
  const blocked = new Set();
  const lines = robots.split(/\r?\n/).map((l) => l.replace(/#.*/, "").trim()).filter(Boolean);
  let agents = [];
  let inRules = false;
  for (const line of lines) {
    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      if (inRules) {
        agents = [];
        inRules = false;
      }
      agents.push(value.toLowerCase());
    } else if (key === "disallow" || key === "allow") {
      inRules = true;
      if (key === "disallow" && value === "/") {
        for (const bot of AI_BOTS) if (agents.includes(bot.toLowerCase())) blocked.add(bot);
      }
    }
  }
  return [...blocked];
}

export function productSchemas(html) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1].trim());
      const walk = (node) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) return node.forEach(walk);
        const type = [].concat(node["@type"] || []);
        if (type.includes("Product") || type.includes("ProductGroup")) out.push(node);
        if (node["@graph"]) walk(node["@graph"]);
      };
      walk(data);
    } catch {
      /* invalid JSON-LD is itself a finding, counted below */
      out.push({ __invalid: true });
    }
  }
  return out;
}

export function schemaFields(schemas) {
  const valid = schemas.filter((s) => !s.__invalid);
  const json = JSON.stringify(valid);
  const offers = valid.flatMap((s) => [].concat(s.offers || [], ...(s.hasVariant || []).map((v) => [].concat(v.offers || []))));
  const offerJson = JSON.stringify(offers);
  return {
    hasProductSchema: valid.length > 0,
    invalidJsonLd: schemas.some((s) => s.__invalid),
    offers: offers.length > 0,
    price: /"price"/.test(offerJson),
    availability: /"availability"/.test(offerJson),
    brand: /"brand"/.test(json),
    gtin: /"gtin(8|12|13|14)?"\s*:\s*"?[0-9]{8,14}/.test(json),
    aggregateRating: /"aggregateRating"/.test(json),
    shippingDetails: /"shippingDetails"/.test(json),
    returnPolicy: /"hasMerchantReturnPolicy"/.test(json)
  };
}

export function scriptHosts(html, storeHost) {
  const hosts = new Set();
  for (const m of html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)) {
    let src = m[1];
    if (src.startsWith("//")) src = `https:${src}`;
    if (!/^https?:/i.test(src)) continue;
    try {
      const host = new URL(src).hostname.replace(/^www\./, "");
      if (/(^|\.)shopify(cdn|cloud)?\.(com|net)$|shopifycdn|cdn\.shopify\.com|myshopify\.com|shop\.app$/.test(host)) continue;
      if (host === storeHost || host.endsWith(`.${storeHost}`)) continue;
      hosts.add(host);
    } catch {
      /* ignore malformed */
    }
  }
  return [...hosts];
}

// All page-level checks for one product page's HTML.
export function analyzeProductPage(html, storeHost) {
  const text = visibleText(html);
  const fields = schemaFields(productSchemas(html));
  const reviewApps = Object.entries(REVIEW_APPS)
    .filter(([, rx]) => rx.test(html))
    .map(([name]) => name);
  return {
    pdp: {
      htmlKB: Math.round(html.length / 1024),
      deliveryStated: RX.delivery.test(text),
      returnsStated: RX.returns.test(text),
      sizeGuidance: RX.size.test(text),
      deliveryMatch: (text.match(RX.delivery) || [""])[0].slice(0, 90),
      returnsMatch: (text.match(RX.returns) || [""])[0].slice(0, 90),
      reviewApps,
      reviewSignal: reviewApps.length > 0 || fields.aggregateRating,
      thirdPartyScriptHosts: scriptHosts(html, storeHost)
    },
    schema: fields
  };
}

export const isShopifyHtml = (html) =>
  /cdn\.shopify\.com|Shopify\.shop|shopify-section|myshopify\.com|window\.Shopify/i.test(html);
