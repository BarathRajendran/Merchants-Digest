// Site-wide copy and taxonomy for scripts/build-site.mjs.
// Every post in content/blog-agent/blog-manifest.json needs a `topic` matching one of the slugs below.

export const site = {
  name: "Merchants Digest",
  domain: "merchantsdigest.com",
  origin: "https://www.merchantsdigest.com",
  gaId: "G-5FQK2WSDWH",
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

// Newsletter issues, newest first. Bodies live in content/newsletter/<slug>.html.
export const issues = [
  {
    slug: "feb-2026",
    label: "February 2026",
    title: "February 2026: clarity beats complexity",
    summary:
      "Growth is coming from cleanups, not experiments: Reddit as a buyer discovery channel, message alignment, and the Shopify updates worth acting on.",
    image: "/images/Newsletter/feb-hero.png"
  },
  {
    slug: "jan-2026",
    label: "January 2026",
    title: "January 2026: resetting how you think about growth",
    summary:
      "Why AI-ready product pages matter for organic discovery, what is building trust in social ads, and the quiet fixes top Shopify stores make.",
    image: "/images/Home%20Page/NL%20header.jpg"
  }
];
