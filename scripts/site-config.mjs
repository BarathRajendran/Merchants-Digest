// Site-wide copy and taxonomy for scripts/build-site.mjs.
// Every post in content/blog-agent/blog-manifest.json needs a `topic` matching one of the slugs below.

export const site = {
  name: "Merchants Digest",
  domain: "merchantsdigest.com",
  origin: "https://www.merchantsdigest.com",
  gaId: "G-5FQK2WSDWH",
  // Signs newsletter issues. Kept anonymous for now; set person: true and a real name to show one.
  author: { name: "The editor", role: "Former Shopify app founder, Merchants Digest", person: false },
  tagline: "Research, tools and guides for Shopify merchants",
  description:
    "Original research, free tools and practical guides for Shopify merchants, from a former Shopify app founder.",
  // Home hero. `title` may contain <em> for the highlighted phrase.
  hero: {
    title: "Make your Shopify store <em>easier to buy from.</em>",
    lede:
      "Original research, free tools and plain-English guides from a former Shopify app founder. We check what real stores do, show our method, and skip the growth hacks.",
    points: [
      { topic: "ai-search", icon: "%", title: "Original research", body: "We check real Shopify stores and publish what they actually do." },
      { topic: "conversion", icon: "✓", title: "Free tools", body: "Check your own product page against 90 fashion brands." },
      { topic: "trust", icon: "↗", title: "Shopify changes, triaged", body: "What changed this month, and whether it matters for your store." }
    ]
  },
  footerBlurb:
    "Original research, free tools and practical guides for Shopify merchants. Written by a former Shopify app founder. No paid placements.",
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
