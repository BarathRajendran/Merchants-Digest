// Site-wide copy and taxonomy for scripts/build-site.mjs.
// Every post in content/blog-agent/blog-manifest.json needs a `topic` matching one of the slugs below.

export const site = {
  name: "Merchants Digest",
  domain: "merchantsdigest.com",
  origin: "https://www.merchantsdigest.com",
  gaId: "G-5FQK2WSDWH",
  // Signs newsletter issues. Kept anonymous for now; set person: true and a real name to show one.
  author: { name: "The editor", role: "Merchants Digest", person: false },
  tagline: "Practical writing for Shopify merchants",
  description:
    "Practical articles for Shopify merchants on conversion, product pages, trust, catalog structure, and how AI search finds what you sell.",
  // Home hero. `title` may contain <em> for the highlighted phrase.
  hero: {
    title: "Make your Shopify store <em>easier to buy from.</em>",
    lede:
      "Plain-English articles on conversion, product pages, trust, and getting found in AI search. Written for the people who actually run the store.",
    points: [
      { topic: "conversion", icon: "↗", title: "Fixes you can ship this week", body: "Specific changes to pages you already have, not theory." },
      { topic: "ai-search", icon: "✦", title: "What changed in search and AI", body: "And whether it matters for a store your size." },
      { topic: "trust", icon: "✓", title: "Honest trade-offs", body: "No growth hacks, no 5x promises, no app upsells." }
    ]
  },
  footerBlurb:
    "Independent, practical writing for Shopify merchants, operators, and founders. Clear trade-offs, real store situations, no fluff.",
  subscribe: {
    title: "Get new articles in your inbox.",
    body:
      "Merchants Digest is free. Each email brings the latest articles and the Shopify changes worth knowing about, written for the person who actually runs the store."
  }
};

export const topics = [
  {
    slug: "conversion",
    name: "Conversion",
    navName: "Conversion",
    description: "Why visitors leave without buying, and the fixes that make existing traffic convert."
  },
  {
    slug: "product-pages",
    name: "Product pages",
    navName: "Product pages",
    description: "What buyers look for on a product page, and how to answer it before they have to ask."
  },
  {
    slug: "trust",
    name: "Trust & policies",
    navName: "Trust",
    description: "Reviews, policies, and the small signals that make a store feel safe to buy from."
  },
  {
    slug: "ai-search",
    name: "AI search & discovery",
    navName: "AI search",
    description: "How search engines, AI assistants, and communities decide which stores to surface."
  },
  {
    slug: "catalog",
    name: "Catalog & merchandising",
    navName: "Catalog",
    description: "Collections, naming, and product data that help buyers and search find the right item."
  }
];
