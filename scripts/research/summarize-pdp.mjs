// Turn private per-store audit records into a publishable, aggregate-only summary.
// Usage: node scripts/research/summarize-pdp.mjs research-data/<study>/raw.json content/research/<study>/summary.json
// The output contains counts and percentages only. No store names, domains, URLs or quoted page text.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const [rawPath, outPath] = process.argv.slice(2);
if (!rawPath || !outPath) throw new Error("Usage: summarize-pdp.mjs <raw.json> <summary.json>");

const all = JSON.parse(await readFile(rawPath, "utf8"));
const ok = all.filter((r) => r.status === "ok");
const n = ok.length;
const count = (fn) => ok.filter(fn).length;
const stat = (fn) => {
  const c = count(fn);
  return { count: c, pct: Math.round((c / n) * 100) };
};
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

// App vendors (not stores) behind the most common third-party script hosts, grouped by job.
const VENDOR_CATEGORIES = [
  ["Email and SMS marketing", /klaviyo|attn\.tv|attentive|postscript|omnisend|listrak/],
  ["Reviews and UGC", /yotpo|okendo|judge\.me|juniphq|stamped|loox|reviews\.io|bazaarvoice|powerreviews|trustpilot/],
  ["Support chat and help desk", /gorgias|zdassets|zendesk|tidio|richpanel|kustomer|intercom/],
  ["Analytics, tags and ads", /googletagmanager|google-analytics|googleadservices|doubleclick|facebook|tiktok|pinterest|snap|bing|criteo|hotjar|clarity/],
  ["Testing and personalisation", /intelligems|optimizely|vwo|convert\.com|dynamicyield|nosto|rebuy|bold/],
  ["Consent and privacy", /cookielaw|onetrust|truevault|termly|cookiebot|osano/],
  ["Creator and affiliate", /shopmy|impact|refersion|awin|social snowball|upfluence/],
  ["Video and shoppable content", /tolstoy|videowise|firework|tapcart/],
  ["Delivery, returns and stock alerts", /narvar|loop|aftership|useamp|backinstock|route|redo/],
  ["Public code CDNs", /jsdelivr|unpkg|cdnjs|jquery/]
];

const hostCounts = ok.map((r) => r.pdp.thirdPartyScriptHosts.length);
const buckets = [
  ["0 to 3", (x) => x <= 3],
  ["4 to 6", (x) => x >= 4 && x <= 6],
  ["7 to 9", (x) => x >= 7 && x <= 9],
  ["10 or more", (x) => x >= 10]
].map(([label, fn]) => ({ label, count: hostCounts.filter(fn).length }));

const categoryStores = VENDOR_CATEGORIES.map(([label, rx]) => ({
  label,
  stores: count((r) => r.pdp.thirdPartyScriptHosts.some((h) => rx.test(h)))
})).sort((a, b) => b.stores - a.stores);

const summary = {
  study: "apparel-pdp-2026",
  title: "What 90 Shopify fashion brands show on their product pages",
  fieldwork: { start: ok.map((r) => r.auditedAt).sort()[0].slice(0, 10), end: ok.map((r) => r.auditedAt).sort().at(-1).slice(0, 10) },
  sample: {
    audited: n,
    candidates: all.length,
    excluded: all.length - n,
    description:
      "Established direct-to-consumer apparel, footwear and accessories brands, each verified as running on Shopify. One in-stock product page per store; gift cards, samples and add-ons excluded."
  },
  buyerFacing: {
    deliveryTimeframe: stat((r) => r.pdp.deliveryStated),
    returnsTerms: stat((r) => r.pdp.returnsStated),
    sizeGuidance: stat((r) => r.pdp.sizeGuidance),
    allThree: stat((r) => r.pdp.deliveryStated && r.pdp.returnsStated && r.pdp.sizeGuidance),
    neitherDeliveryNorReturns: stat((r) => !r.pdp.deliveryStated && !r.pdp.returnsStated),
    reviewWidget: stat((r) => r.pdp.reviewApps.length > 0),
    noReviewSignal: stat((r) => !r.pdp.reviewSignal)
  },
  structuredData: {
    productSchema: stat((r) => r.schema.hasProductSchema),
    price: stat((r) => r.schema.price),
    availability: stat((r) => r.schema.availability),
    brand: stat((r) => r.schema.brand),
    gtin: stat((r) => r.schema.gtin),
    aggregateRating: stat((r) => r.schema.aggregateRating),
    shippingDetails: stat((r) => r.schema.shippingDetails),
    returnPolicy: stat((r) => r.schema.returnPolicy),
    invalidJsonLd: stat((r) => r.schema.invalidJsonLd),
    reviewsShownButNotInSchema: stat((r) => r.pdp.reviewApps.length > 0 && !r.schema.aggregateRating)
  },
  pageWeight: {
    thirdPartyScriptHostsMedian: median(hostCounts),
    thirdPartyScriptHostsMax: Math.max(...hostCounts),
    tenOrMoreHosts: stat((r) => r.pdp.thirdPartyScriptHosts.length >= 10),
    hostBuckets: buckets,
    vendorCategories: categoryStores,
    htmlKBMedian: median(ok.map((r) => r.pdp.htmlKB))
  },
  aiAccess: {
    robotsFetched: stat((r) => r.robots.fetched),
    blocksAnyAiCrawler: stat((r) => r.robots.aiBotsBlocked.length > 0),
    llmsTxtPresent: stat((r) => r.llmsTxt),
    refundPolicyPage: stat((r) => r.policies.refund),
    shippingPolicyPage: stat((r) => r.policies.shipping)
  },
  method: {
    calibration:
      "Five product pages marked as having no delivery timeframe were reopened in a full browser after scripts loaded; none showed one.",
    limitations: [
      "Checks read the HTML a store sends before JavaScript runs. That is also what many AI crawlers read, but widgets added later by scripts can be missed, so text checks are a lower bound.",
      "One product page per store. A store may show more on other products.",
      "The sample is established brands, which are likely better resourced than the average Shopify store."
    ]
  }
};

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
