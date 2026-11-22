// Merchants Digest static site generator (zero dependencies).
//
// Sources of truth:
//   content/blog-agent/blog-manifest.json   post list, dates, topics, status
//   content/blog-agent/drafts/<slug>.json   article bodies
//   content/newsletter/*.html               newsletter issue bodies
//   content/pages/*.html                    simple pages (privacy policy)
//   content/newsletter/<slug>.json          newsletter issues (web page + email exports)
//   scripts/site-config.mjs                 topics, author, site copy
//
// Output (repo root, served as-is by Vercel):
//   index.html, articles.html, topic-<slug>.html, blog-<slug>.html, newsletter*.html,
//   privacy-policy.html, 404.html, feed.xml, sitemap.xml, robots.txt, vercel.json
//
// Usage: node scripts/build-site.mjs        (npm run site:build)

import { readFile, writeFile, stat, readdir, mkdir } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { site, topics } from "./site-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentDir = path.join(root, "content", "blog-agent");
// Cache-busting token for /assets: changes only when the stylesheet or script changes, so rebuilds stay diff-free.
const VERSION = createHash("sha1")
  .update(readFileSync(path.join(root, "assets", "site.css")))
  .update(readFileSync(path.join(root, "assets", "site.js")))
  .digest("hex")
  .slice(0, 8);

// ---------- helpers ----------

const esc = (value = "") =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const slugify = (value) =>
  String(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const parseDate = (iso) => new Date(`${iso}T12:00:00Z`);
const fmtDate = (iso) =>
  parseDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const fmtLongDate = (iso) =>
  parseDate(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const rfc822 = (iso) => parseDate(iso).toUTCString();

const topicBySlug = new Map(topics.map((t) => [t.slug, t]));
const postUrl = (post) => `/blog/${post.slug}`;
const topicUrl = (topic) => `/topics/${topic.slug}`;
const abs = (p) => `${site.origin}${p}`;

function cover(post, size) {
  const local = `/images/covers/${post.slug}-${size}.jpg`;
  if (existsSync(path.join(root, local))) return local;
  return encodeURI(decodeURI(post.heroImagePath || "/images/Home%20Page/NL%20header.jpg"));
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function write(file, content) {
  await writeFile(path.join(root, file), content, "utf8");
}

// Best-effort topic for new drafts that arrive without one. Set `topic` explicitly in the draft to override.
const TOPIC_KEYWORDS = {
  "ai-search": ["ai ", "search", "seo", "aeo", "discover", "agent", "assistant", "chatgpt", "reddit", "answer engine", "schema", "structured data"],
  "product-pages": ["product page", "pdp", "sizing", "faq", "product context", "mobile", "description"],
  trust: ["trust", "review", "policy", "policies", "return", "shipping", "premium", "credib", "doubt"],
  catalog: ["catalog", "collection", "merchandis", "naming", "grouping", "variant", "filter", "product data"],
  conversion: ["convert", "conversion", "aov", "bundle", "traffic", "checkout", "abandon", "theme", "speed", "app"]
};
export function inferTopic(post) {
  const text = ` ${post.title || ""} ${post.description || ""} ${post.excerpt || ""} `.toLowerCase();
  let best = "conversion";
  let bestScore = 0;
  for (const [slug, words] of Object.entries(TOPIC_KEYWORDS)) {
    const score = words.reduce((n, w) => n + (text.includes(w) ? 1 : 0), 0);
    if (score > bestScore) [best, bestScore] = [slug, score];
  }
  return best;
}

// ---------- shared chrome ----------

const icon = (name) =>
  ({
    arrow: `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
  })[name];

function head({ title, description, canonical, image, type = "website", schema, extraHead = "" }) {
  const fullTitle = title === site.name ? `${site.name} — ${site.tagline}` : `${title} | ${site.name}`;
  const ogImage = image ? abs(image) : abs("/images/covers/og-default.jpg");
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${esc(fullTitle)}</title>
    <meta name="description" content="${esc(description)}" />
    <link rel="canonical" href="${esc(abs(canonical))}" />
    <meta name="theme-color" content="#ffffff" />
    <meta property="og:site_name" content="${esc(site.name)}" />
    <meta property="og:type" content="${type}" />
    <meta property="og:title" content="${esc(title)}" />
    <meta property="og:description" content="${esc(description)}" />
    <meta property="og:url" content="${esc(abs(canonical))}" />
    <meta property="og:image" content="${esc(ogImage)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml" />
    <link rel="alternate" type="application/rss+xml" title="${esc(site.name)}" href="/feed.xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:ital,opsz,wght@0,6..72,400..700;1,6..72,400..600&display=swap" />
    <link rel="stylesheet" href="/assets/site.css?v=${VERSION}" />
    ${extraHead}
    <script type="application/ld+json">${JSON.stringify(schema)}</script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=${site.gaId}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag() { dataLayer.push(arguments); }
      gtag("js", new Date());
      gtag("config", "${site.gaId}");
    </script>
  </head>`;
}

function header(current) {
  const link = (href, label, key) =>
    `<a href="${href}"${current === key ? ' aria-current="page"' : ""}>${label}</a>`;
  return `
  <body>
    <a class="skip-link" href="#main">Skip to content</a>
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="/" aria-label="${esc(site.name)} home">
          <img class="brand-mark" src="/assets/logo-mark.svg" alt="" width="34" height="19" />
          <span class="brand-name"><b>Merchants</b> <span>Digest</span></span>
        </a>
        <a class="button button--small header-cta" href="#subscribe">Subscribe</a>
        <nav class="site-nav" aria-label="Primary">
          ${link("/blogs", "Articles", "articles")}
          ${topics.map((t) => link(topicUrl(t), esc(t.navName), `topic:${t.slug}`)).join("\n          ")}
          ${link("/newsletter", "Newsletter", "newsletter")}
          <a class="button button--small" href="#subscribe">Subscribe</a>
        </nav>
      </div>
    </header>`;
}

function subscribeBand(source) {
  return `
      <section class="subscribe-band" id="subscribe" aria-labelledby="subscribe-title">
        <div>
          <h2 id="subscribe-title">${esc(site.subscribe.title)}</h2>
          <p>${esc(site.subscribe.body)}</p>
        </div>
        <form class="subscribe-form js-subscribe" data-source="${esc(source)}">
          <label class="visually-hidden" for="email-${esc(source)}">Email address</label>
          <input id="email-${esc(source)}" type="email" name="email" placeholder="you@yourstore.com" autocomplete="email" required />
          <button class="button" type="submit">Subscribe</button>
          <p class="form-message" role="status" aria-live="polite"></p>
          <p class="fineprint">Free. Unsubscribe anytime. <a href="/privacy-policy" style="color:inherit">Privacy policy</a>.</p>
        </form>
      </section>`;
}

function footer() {
  const year = new Date().getFullYear();
  return `
    <footer class="site-footer">
      <div class="wrap">
        <div class="footer-grid">
          <div>
            <a class="brand" href="/">
              <img class="brand-mark" src="/assets/logo-mark.svg" alt="" width="34" height="19" />
              <span class="brand-name"><b>Merchants</b> <span>Digest</span></span>
            </a>
            <p>${esc(site.footerBlurb)}</p>
          </div>
          <div>
            <h2>Topics</h2>
            <ul>
              ${topics.map((t) => `<li><a href="${topicUrl(t)}">${esc(t.name)}</a></li>`).join("\n              ")}
            </ul>
          </div>
          <div>
            <h2>Read</h2>
            <ul>
              <li><a href="/blogs">All articles</a></li>
              <li><a href="/newsletter">Newsletter archive</a></li>
              <li><a href="/feed.xml">RSS feed</a></li>
              <li><a href="/privacy-policy">Privacy policy</a></li>
            </ul>
          </div>
        </div>
        <div class="footer-base">
          <span>&copy; ${year} ${esc(site.domain)}. Independent writing for Shopify merchants.</span>
          <span>Not affiliated with Shopify Inc.</span>
        </div>
      </div>
    </footer>
    <script src="/assets/site.js?v=${VERSION}" defer></script>
  </body>
</html>
`;
}

const organization = {
  "@type": "Organization",
  "@id": `${site.origin}/#organization`,
  name: site.name,
  url: site.origin,
  logo: abs("/Primary%20Logo.png")
};
const website = {
  "@type": "WebSite",
  "@id": `${site.origin}/#website`,
  url: site.origin,
  name: site.name,
  description: site.description,
  publisher: { "@id": organization["@id"] },
  inLanguage: "en"
};

// ---------- components ----------

function card(post, { excerpt = true, kicker = true, eager = false } = {}) {
  const topic = topicBySlug.get(post.topic);
  return `
          <article class="card" data-topic="${esc(post.topic)}">
            <div class="card-media">
              <img src="${cover(post, 800)}" alt="" width="800" height="450" ${eager ? "" : 'loading="lazy" '}decoding="async" />
            </div>
            ${kicker && topic ? `<a class="kicker t-${topic.slug}" href="${topicUrl(topic)}">${esc(topic.name)}</a>` : ""}
            <h3><a href="${postUrl(post)}">${esc(post.title)}</a></h3>
            ${excerpt ? `<p class="excerpt">${esc(post.excerpt)}</p>` : ""}
            <p class="meta"><time datetime="${post.publishDate}">${fmtDate(post.publishDate)}</time><span>${post.readTimeMinutes} min read</span></p>
          </article>`;
}

// ---------- pages ----------

function renderHome(posts) {
  const [lead, ...rest] = posts;
  const latest = rest.slice(0, 5);
  const shown = new Set([lead, ...latest].map((p) => p.slug));
  const leadTopic = topicBySlug.get(lead.topic);

  const topicSections = topics
    .map((topic) => {
      const inTopic = posts.filter((p) => p.topic === topic.slug);
      const picks = [...inTopic.filter((p) => !shown.has(p.slug)), ...inTopic.filter((p) => shown.has(p.slug))].slice(0, 3);
      return `
      <section class="topic-block t-${topic.slug}" aria-labelledby="t-${topic.slug}">
        <div class="section-head">
          <div>
            <h2 id="t-${topic.slug}">${esc(topic.name)}</h2>
            <p>${esc(topic.description)}</p>
          </div>
          <a class="more" href="${topicUrl(topic)}">All ${inTopic.length} ${icon("arrow")}</a>
        </div>
        <div class="grid grid--3">${picks.map((p) => card(p, { kicker: false })).join("")}
        </div>
      </section>`;
    })
    .join("");

  return `${head({
    title: site.name,
    description: site.description,
    canonical: "/",
    image: cover(lead, 1600),
    schema: { "@context": "https://schema.org", "@graph": [organization, website] }
  })}${header("home")}
    <main id="main" class="wrap">
      <section class="home-hero" aria-labelledby="hero-title">
        <div>
          <span class="kicker">Free for Shopify merchants</span>
          <h1 id="hero-title">${site.hero.title}</h1>
          <p class="lede">${esc(site.hero.lede)}</p>
          <form class="subscribe-form js-subscribe" data-source="home-hero">
            <label class="visually-hidden" for="email-hero">Email address</label>
            <input id="email-hero" type="email" name="email" placeholder="you@yourstore.com" autocomplete="email" required />
            <button class="button" type="submit">Get the articles</button>
            <p class="form-message" role="status" aria-live="polite"></p>
          </form>
          <p class="proof"><span>Free</span><span>${posts.length} practical articles so far</span><span>Unsubscribe anytime</span></p>
        </div>
        <div class="hero-card">
          <h2>What you will find here</h2>
          <ul>
            ${site.hero.points
              .map(
                (p) => `<li class="t-${p.topic}"><span class="dot" aria-hidden="true">${p.icon}</span><div><strong>${esc(p.title)}</strong><span class="sub">${esc(p.body)}</span></div></li>`
              )
              .join("\n            ")}
          </ul>
        </div>
      </section>

      <section class="front" aria-label="Latest articles">
        <article class="lead-story">
          <div class="card-media">
            <img src="${cover(lead, 1600)}" srcset="${cover(lead, 800)} 800w, ${cover(lead, 1600)} 1600w" sizes="(min-width: 980px) 720px, 100vw" alt="${esc(lead.heroImageAlt || "")}" width="1600" height="900" fetchpriority="high" />
          </div>
          ${leadTopic ? `<a class="kicker t-${leadTopic.slug}" href="${topicUrl(leadTopic)}">${esc(leadTopic.name)}</a>` : ""}
          <h2><a href="${postUrl(lead)}">${esc(lead.title)}</a></h2>
          <p class="dek">${esc(lead.excerpt)}</p>
          <p class="meta"><time datetime="${lead.publishDate}">${fmtDate(lead.publishDate)}</time><span>${lead.readTimeMinutes} min read</span></p>
        </article>

        <aside class="latest" aria-labelledby="latest-title">
          <h2 id="latest-title">Recently published</h2>
          <ol>
            ${latest
              .map((p) => {
                const t = topicBySlug.get(p.topic);
                return `<li>
              <a class="kicker t-${t.slug}" href="${topicUrl(t)}">${esc(t.name)}</a>
              <h3><a href="${postUrl(p)}">${esc(p.title)}</a></h3>
              <p class="meta"><time datetime="${p.publishDate}">${fmtDate(p.publishDate)}</time><span>${p.readTimeMinutes} min</span></p>
            </li>`;
              })
              .join("\n            ")}
          </ol>
          <a class="all" href="/blogs">Browse all ${posts.length} articles ${icon("arrow")}</a>
        </aside>
      </section>

      <nav class="topic-index" aria-label="Topics">
        ${topics
          .map(
            (t) => `<a class="t-${t.slug}" href="${topicUrl(t)}">
          <strong>${esc(t.name)}</strong>
          <span>${esc(t.description)}</span>
          <em>${posts.filter((p) => p.topic === t.slug).length} articles</em>
        </a>`
          )
          .join("\n        ")}
      </nav>
${subscribeBand("home")}
${topicSections}
    </main>
${footer()}`;
}

function renderArchive(posts) {
  const chips = [
    `<li><button class="chip" type="button" data-filter="all" aria-pressed="true">All <small>${posts.length}</small></button></li>`,
    ...topics.map(
      (t) =>
        `<li><button class="chip" type="button" data-filter="${t.slug}" aria-pressed="false">${esc(t.name)} <small>${posts.filter((p) => p.topic === t.slug).length}</small></button></li>`
    )
  ].join("\n          ");

  return `${head({
    title: "All articles",
    description: `Every Merchants Digest article for Shopify merchants: ${topics.map((t) => t.name.toLowerCase()).join(", ")}.`,
    canonical: "/blogs",
    image: cover(posts[0], 1600),
    schema: {
      "@context": "https://schema.org",
      "@graph": [
        organization,
        website,
        {
          "@type": "CollectionPage",
          "@id": abs("/blogs"),
          url: abs("/blogs"),
          name: "All articles",
          isPartOf: { "@id": website["@id"] },
          hasPart: posts.map((p) => ({ "@type": "BlogPosting", headline: p.title, url: abs(postUrl(p)), datePublished: p.publishDate }))
        }
      ]
    }
  })}${header("articles")}
    <main id="main" class="wrap">
      <header class="page-head">
        <span class="kicker">Archive</span>
        <h1>All articles</h1>
        <p>Practical writing for people who run Shopify stores. Filter by topic, or start with the newest.</p>
      </header>
      <ul class="chips" data-filter-bar aria-label="Filter by topic">
          ${chips}
      </ul>
      <p class="visually-hidden" aria-live="polite" data-filter-count></p>
      <section class="archive-section">
        <div class="grid grid--3">${posts.map((p, i) => card(p, { eager: i < 3 })).join("")}
        </div>
      </section>
${subscribeBand("archive")}
    </main>
${footer()}`;
}

function renderTopic(topic, posts) {
  const inTopic = posts.filter((p) => p.topic === topic.slug);
  return `${head({
    title: topic.name,
    description: `${topic.description} Articles from Merchants Digest for Shopify merchants.`,
    canonical: topicUrl(topic),
    image: inTopic[0] ? cover(inTopic[0], 1600) : undefined,
    schema: {
      "@context": "https://schema.org",
      "@graph": [
        organization,
        website,
        {
          "@type": "CollectionPage",
          "@id": abs(topicUrl(topic)),
          url: abs(topicUrl(topic)),
          name: topic.name,
          description: topic.description,
          isPartOf: { "@id": website["@id"] }
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Articles", item: abs("/blogs") },
            { "@type": "ListItem", position: 2, name: topic.name, item: abs(topicUrl(topic)) }
          ]
        }
      ]
    }
  })}${header(`topic:${topic.slug}`)}
    <main id="main" class="wrap">
      <header class="page-head">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="/blogs">Articles</a><span aria-hidden="true">/</span><span>${esc(topic.name)}</span></nav>
        <span class="kicker t-${topic.slug}">${inTopic.length} articles</span>
        <h1>${esc(topic.name)}</h1>
        <p>${esc(topic.description)}</p>
      </header>
      <ul class="chips" aria-label="Topics">
        ${topics
          .map(
            (t) =>
              `<li><a class="chip" href="${topicUrl(t)}"${t.slug === topic.slug ? ' aria-current="page"' : ""}>${esc(t.name)}</a></li>`
          )
          .join("\n        ")}
      </ul>
      <section class="archive-section">
        <div class="grid grid--3">${inTopic.map((p, i) => card(p, { kicker: false, eager: i < 3 })).join("")}
        </div>
      </section>
${subscribeBand(`topic-${topic.slug}`)}
    </main>
${footer()}`;
}

function renderBlocks(section) {
  if (Array.isArray(section.blocks)) {
    return section.blocks
      .map((b) => {
        if (b.type === "p") return `<p>${esc(b.text)}</p>`;
        if (b.type === "h3") return `<h3>${esc(b.text)}</h3>`;
        if (b.type === "callout") return `<blockquote class="callout"><p>${esc(b.text)}</p></blockquote>`;
        if (b.type === "ul") return `<ul>${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
        if (b.type === "ol") return `<ol>${b.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ol>`;
        return "";
      })
      .join("\n          ");
  }
  const paragraphs = (section.paragraphs || []).map((p) => `<p>${esc(p)}</p>`);
  if (section.callout) {
    paragraphs.splice(Math.min(1, paragraphs.length), 0, `<blockquote class="callout"><p>${esc(section.callout)}</p></blockquote>`);
  }
  const bullets = section.bullets?.length ? [`<ul>${section.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>`] : [];
  return [...paragraphs, ...bullets].join("\n          ");
}

function wordCount(draft) {
  const text = [
    draft.lead,
    ...(draft.introParagraphs || []),
    ...draft.sections.flatMap((s) => [
      s.heading,
      ...(s.paragraphs || []),
      ...(s.bullets || []),
      s.callout || "",
      ...(s.blocks || []).map((b) => b.text || (b.items || []).join(" "))
    ])
  ].join(" ");
  return text.split(/\s+/).filter(Boolean).length;
}

export function renderPost(draft, { prev, next, related = [] } = {}) {
  const topic = topicBySlug.get(draft.topic);
  const canonical = postUrl(draft);
  const used = new Set();
  const sections = draft.sections.map((s) => {
    let id = slugify(s.heading) || "section";
    while (used.has(id)) id += "-2";
    used.add(id);
    return { ...s, id };
  });
  const sources = draft.research?.sourceNotes?.filter((s) => s.url) || [];
  const heroLarge = cover(draft, 1600);

  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      organization,
      website,
      {
        "@type": "BlogPosting",
        "@id": `${abs(canonical)}#post`,
        headline: draft.title,
        description: draft.description,
        image: abs(heroLarge),
        datePublished: draft.publishDate,
        dateModified: draft.updatedDate || draft.publishDate,
        author: { "@id": organization["@id"] },
        publisher: { "@id": organization["@id"] },
        mainEntityOfPage: abs(canonical),
        articleSection: topic?.name,
        wordCount: wordCount(draft),
        inLanguage: "en",
        isPartOf: { "@id": website["@id"] },
        ...(sources.length ? { citation: sources.map((s) => ({ "@type": "CreativeWork", name: s.title, url: s.url })) } : {})
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Articles", item: abs("/blogs") },
          ...(topic ? [{ "@type": "ListItem", position: 2, name: topic.name, item: abs(topicUrl(topic)) }] : []),
          { "@type": "ListItem", position: topic ? 3 : 2, name: draft.title, item: abs(canonical) }
        ]
      }
    ]
  };

  return `${head({
    title: draft.title,
    description: draft.description,
    canonical,
    image: heroLarge,
    type: "article",
    schema,
    extraHead: `<meta property="article:published_time" content="${draft.publishDate}" />${topic ? `\n    <meta property="article:section" content="${esc(topic.name)}" />` : ""}`
  })}${header(topic ? `topic:${topic.slug}` : "articles")}
    <div class="progress" aria-hidden="true"></div>
    <main id="main" class="wrap">
      <article>
        <header class="article-head">
          <nav class="crumbs" aria-label="Breadcrumb">
            <a href="/blogs">Articles</a>${topic ? `<span aria-hidden="true">/</span><a href="${topicUrl(topic)}">${esc(topic.name)}</a>` : ""}
          </nav>
          ${topic ? `<a class="kicker t-${topic.slug}" href="${topicUrl(topic)}">${esc(topic.name)}</a>` : ""}
          <h1>${esc(draft.title)}</h1>
          <p class="dek">${esc(draft.lead)}</p>
          <div class="byline">
            <img src="/assets/logo-mark.svg" alt="" width="36" height="36" />
            <div>
              <strong>${esc(site.name)}</strong>
              <p class="meta"><time datetime="${draft.publishDate}">${fmtLongDate(draft.publishDate)}</time><span>${draft.readTimeMinutes} min read</span></p>
            </div>
          </div>
        </header>

        <figure class="article-hero">
          <img src="${heroLarge}" srcset="${cover(draft, 800)} 800w, ${heroLarge} 1600w" sizes="(min-width: 1184px) 1120px, 100vw" alt="${esc(draft.heroImageAlt || "")}" width="1600" height="900" fetchpriority="high" />
        </figure>

        <div class="article-layout">
          <nav class="toc" aria-label="In this article">
            <details>
              <summary>In this article</summary>
              <ol>
                ${sections.map((s) => `<li><a href="#${s.id}">${esc(s.heading)}</a></li>`).join("\n                ")}
              </ol>
            </details>
            <a class="toc-back" href="${topic ? topicUrl(topic) : "/blogs"}">← More on ${esc(topic ? topic.name.toLowerCase() : "Shopify")}</a>
          </nav>

          <div class="prose">
            ${
              draft.introParagraphs?.length
                ? `<div class="intro">
              ${draft.introParagraphs.map((p) => `<p>${esc(p)}</p>`).join("\n              ")}
            </div>`
                : ""
            }
            ${sections
              .map(
                (s) => `
            <section id="${s.id}" aria-labelledby="${s.id}-h">
              <h2 id="${s.id}-h">${esc(s.heading)}</h2>
          ${renderBlocks(s)}
            </section>`
              )
              .join("")}
            ${
              sources.length
                ? `
            <aside class="sources" aria-labelledby="sources-h">
              <h2 id="sources-h">Sources and further reading</h2>
              <ol>
                ${sources
                  .map(
                    (s) =>
                      `<li><a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.title)}</a>${s.note ? `<p>${esc(s.note)}</p>` : ""}</li>`
                  )
                  .join("\n                ")}
              </ol>
            </aside>`
                : ""
            }
          </div>
        </div>
      </article>

      <div class="post-end">
        <div class="share-row">
          <span>Share this article:</span>
          <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(abs(canonical))}" target="_blank" rel="noopener">LinkedIn</a>
          <a href="https://x.com/intent/post?url=${encodeURIComponent(abs(canonical))}&amp;text=${encodeURIComponent(draft.title)}" target="_blank" rel="noopener">X</a>
          <button type="button" data-copy-link="${esc(abs(canonical))}">Copy link</button>
        </div>
${subscribeBand(`post-${draft.slug}`)}
        ${
          related.length
            ? `<section class="topic-block related" aria-labelledby="related-h">
          <div class="section-head">
            <h2 id="related-h">More on ${esc(topic.name.toLowerCase())}</h2>
            <a class="more" href="${topicUrl(topic)}">All ${esc(topic.name.toLowerCase())} ${icon("arrow")}</a>
          </div>
          <div class="grid grid--3">${related.map((p) => card(p, { kicker: false, excerpt: false })).join("")}
          </div>
        </section>`
            : ""
        }
        <nav class="pager${prev && next ? "" : " pager--single"}" aria-label="More articles">
          ${prev ? `<a class="prev" href="${postUrl(prev)}"><small>← Newer</small><strong>${esc(prev.title)}</strong></a>` : ""}
          ${next ? `<a class="next" href="${postUrl(next)}"><small>Older →</small><strong>${esc(next.title)}</strong></a>` : ""}
        </nav>
      </div>
    </main>
${footer()}`;
}

// ---------- newsletter ----------
// Issues live in content/newsletter/<slug>.json and render three ways: the web archive page,
// an email-ready HTML file and a plain-text file (content/newsletter/email/) for an email service.
//
// Section fields: heading, short (for "In this issue"), paragraphs, bullets (string or {text, href, label}),
// topic (topic slug, colours the badge), style ("updates" | "action"), article (post slug, shows its cover
// as a card), figure ("phone-fold" | "ad-mismatch"), pullquote.

const absLink = (href) => (href.startsWith("/") ? abs(href) : href);

function issueBlocks(section) {
  const items = (section.bullets || []).map((b) => (typeof b === "string" ? { text: b } : b));
  return { paragraphs: section.paragraphs || [], items, link: section.link };
}

const sectionId = (section, index) => `s${index + 1}-${slugify(section.short || section.heading).slice(0, 40)}`;

const FIGURES = {
  "phone-fold": {
    caption: "Your first screen on mobile has to answer three questions before anyone scrolls.",
    web: `<div class="fig-phone">
            <div class="phone" aria-hidden="true">
              <div class="phone-notch"></div>
              <div class="ph-img"></div>
              <div class="ph-line w90"></div><div class="ph-line w60"></div>
              <div class="ph-price"></div>
              <div class="ph-btn">Add to cart</div>
              <div class="ph-fold"><span>Before the scroll</span></div>
              <div class="ph-line w80 faint"></div><div class="ph-line w70 faint"></div>
            </div>
            <ol class="phone-checks">
              <li><strong>What is it?</strong><span>Said plainly in the first line, not left to the photo.</span></li>
              <li><strong>Who is it for?</strong><span>The buyer should recognise themselves.</span></li>
              <li><strong>When does it arrive?</strong><span>A delivery estimate near the button.</span></li>
            </ol>
          </div>`,
    email: (cell) =>
      cell(`<p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#6b766f;text-transform:uppercase;letter-spacing:0.06em;">Before the scroll, your first screen should answer</p>
<p style="margin:0 0 6px;font-size:16px;color:#1b2a23;"><strong>1. What is it?</strong> Said plainly in the first line.</p>
<p style="margin:0 0 6px;font-size:16px;color:#1b2a23;"><strong>2. Who is it for?</strong> The buyer should recognise themselves.</p>
<p style="margin:0;font-size:16px;color:#1b2a23;"><strong>3. When does it arrive?</strong> A delivery estimate near the button.</p>`)
  },
  "ad-mismatch": {
    caption: "The click promised speed. The page opened with fabric. Lead the page with the same promise as the ad.",
    web: `<div class="fig-mismatch">
            <div class="mm-card mm-ad">
              <small>Your ad</small>
              <div class="mm-thumb" aria-hidden="true"></div>
              <strong>Ships in 2 days. Free returns.</strong>
              <span class="mm-cta" aria-hidden="true">Shop now</span>
            </div>
            <div class="mm-vs" aria-label="does not match">≠</div>
            <div class="mm-card mm-page">
              <small>Product page, first line</small>
              <div class="mm-thumb" aria-hidden="true"></div>
              <strong>Hand-woven from 100% organic cotton.</strong>
              <span class="mm-note">Delivery info: three scrolls down</span>
            </div>
          </div>`,
    email: (cell) =>
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 8px;"><tr>
<td width="47%" valign="top" style="padding:14px;border:1px solid #e7e4dc;border-radius:10px;background:#ffffff;"><p style="margin:0 0 6px;font-size:12px;color:#6b766f;text-transform:uppercase;letter-spacing:0.06em;">Your ad</p><p style="margin:0;font-size:16px;font-weight:600;color:#1b2a23;">Ships in 2 days. Free returns.</p></td>
<td width="6%" align="center" style="font-size:22px;color:#c2410c;font-weight:700;">&ne;</td>
<td width="47%" valign="top" style="padding:14px;border:1px solid #e7e4dc;border-radius:10px;background:#ffffff;"><p style="margin:0 0 6px;font-size:12px;color:#6b766f;text-transform:uppercase;letter-spacing:0.06em;">Product page, first line</p><p style="margin:0;font-size:16px;font-weight:600;color:#1b2a23;">Hand-woven from 100% organic cotton.</p></td>
</tr></table>`
  }
};

function renderNewsletterIndex(issues) {
  return `${head({
    title: "Newsletter",
    description: "Past issues of the Merchants Digest newsletter for Shopify merchants.",
    canonical: "/newsletter",
    schema: { "@context": "https://schema.org", "@graph": [organization, website] }
  })}${header("newsletter")}
    <main id="main" class="wrap">
      <header class="page-head">
        <span class="kicker">Newsletter</span>
        <h1>The Merchants Digest newsletter</h1>
        <p>A short letter about what is worth fixing on a Shopify store, and which platform changes actually matter. Here is every past issue, newest first.</p>
      </header>
      <ol class="letter-list">
        ${issues
          .map(
            (i) => `<li>
          <div class="ll-issue"><strong>Issue ${i.number}</strong><time datetime="${i.date}">${esc(i.label)}</time></div>
          <div>
            <h2><a href="/newsletter/${i.slug}">${esc(i.subject)}</a></h2>
            <p>${esc(i.preview)}</p>
            <p class="ll-topics">${i.sections
              .filter((s) => s.topic)
              .map((s) => `<span class="kicker t-${s.topic}">${esc(topicBySlug.get(s.topic)?.navName || "")}</span>`)
              .join(" ")}</p>
          </div>
        </li>`
          )
          .join("\n        ")}
      </ol>
${subscribeBand("newsletter")}
    </main>
${footer()}`;
}

function issueItemHtml(i) {
  if (!i.href) return `<li>${esc(i.text)}</li>`;
  const external = i.href.startsWith("http") ? ' rel="noopener" target="_blank"' : "";
  return `<li>${esc(i.text)} <a href="${esc(i.href)}"${external}>${esc(i.label || "Read more")}</a></li>`;
}

function articleCard(post, label = "From the blog") {
  if (!post) return "";
  const topic = topicBySlug.get(post.topic);
  return `<a class="nl-article${topic ? ` t-${topic.slug}` : ""}" href="${postUrl(post)}">
            <img src="${cover(post, 800)}" alt="" width="800" height="450" loading="lazy" />
            <span class="nl-article-body">
              <small>${esc(label)}</small>
              <strong>${esc(post.title)}</strong>
              <em>${post.readTimeMinutes} min read · Read the article →</em>
            </span>
          </a>`;
}

function renderIssue(issue, { newer, older, postsBySlug = new Map() } = {}) {
  const sections = issue.sections
    .map((section, index) => {
      const { paragraphs, items, link } = issueBlocks(section);
      const id = sectionId(section, index);
      const topic = section.topic ? topicBySlug.get(section.topic) : null;
      const figure = section.figure ? FIGURES[section.figure] : null;
      const post = section.article ? postsBySlug.get(section.article) : null;
      const style = section.style || "default";

      let list = "";
      if (items.length && style === "updates") {
        list = `<div class="nl-updates">${items
          .map(
            (i) => `
            <div class="nl-update">
              <p>${esc(i.text)}</p>
              ${i.href ? `<a href="${esc(i.href)}" rel="noopener" target="_blank">${esc(i.label || "Read more")} →</a>` : ""}
            </div>`
          )
          .join("")}
          </div>`;
      } else if (items.length && style === "action") {
        list = `<ul class="nl-checklist">${items.map((i) => `<li>${esc(i.text)}</li>`).join("")}</ul>`;
      } else if (items.length) {
        list = `<ul>${items.map(issueItemHtml).join("")}</ul>`;
      }

      const label =
        style === "action"
          ? `<span class="nl-label nl-label--action">Try this week</span>`
          : style === "updates"
            ? `<span class="nl-label nl-label--updates">Platform</span>`
            : topic
              ? `<span class="kicker t-${topic.slug}">${esc(topic.name)}</span>`
              : "";

      return `
          <section id="${id}" class="nl-section nl-section--${style}">
            ${label}
            <h2>${esc(section.heading)}</h2>
            ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join("\n            ")}
            ${list}
            ${section.pullquote ? `<blockquote class="nl-quote"><p>${esc(section.pullquote)}</p></blockquote>` : ""}
            ${figure ? `<figure class="nl-figure">${figure.web}<figcaption>${esc(figure.caption)}</figcaption></figure>` : ""}
            ${post ? articleCard(post, style === "action" ? "Go deeper" : "From the blog") : ""}
            ${link ? `<p><a href="${esc(link.href)}">${esc(link.text)} →</a></p>` : ""}
          </section>`;
    })
    .join("");

  const toc = issue.sections
    .map((section, index) => {
      const topic = section.topic ? topicBySlug.get(section.topic) : null;
      const tag =
        section.style === "action" ? "Try this" : section.style === "updates" ? "Platform" : topic ? topic.navName : "";
      const cls = section.style === "action" ? "t-catalog" : section.style === "updates" ? "t-product-pages" : topic ? `t-${topic.slug}` : "";
      return `<li><a href="#${sectionId(section, index)}"><span class="nl-toc-tag ${cls}">${esc(tag)}</span>${esc(section.short || section.heading)}</a></li>`;
    })
    .join("\n              ");

  return `${head({
    title: issue.subject,
    description: issue.preview,
    canonical: `/newsletter/${issue.slug}`,
    type: "article",
    schema: {
      "@context": "https://schema.org",
      "@graph": [
        organization,
        website,
        {
          "@type": "Article",
          headline: issue.subject,
          description: issue.preview,
          datePublished: issue.date,
          author: site.author.person ? { "@type": "Person", name: site.author.name } : { "@id": organization["@id"] },
          publisher: { "@id": organization["@id"] },
          mainEntityOfPage: abs(`/newsletter/${issue.slug}`)
        }
      ]
    }
  })}${header("newsletter")}
    <main id="main" class="wrap">
      <div class="letter-shell">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="/newsletter">Newsletter</a><span aria-hidden="true">/</span><span>${esc(issue.label)}</span></nav>
        <article class="letter">
          <header class="nl-mast">
            <div class="nl-mast-top">
              <span class="nl-brand"><img src="/assets/logo-mark.svg" alt="" width="28" height="16" />Merchants Digest</span>
              <span>Issue ${issue.number} · ${esc(issue.label)}</span>
            </div>
            <h1>${esc(issue.subject)}</h1>
            <p class="nl-dek">${esc(issue.preview)}</p>
            <p class="nl-meta">${esc(site.author.name)} at ${esc(site.name)} · ${issue.readMinutes || 4} min read</p>
          </header>

          <div class="letter-body prose">
            <p class="nl-greeting">${esc(issue.greeting)}</p>
            ${issue.intro.map((p) => `<p>${esc(p)}</p>`).join("\n            ")}

            <nav class="nl-toc" aria-label="In this issue">
              <h2>In this issue</h2>
              <ol>
              ${toc}
              </ol>
            </nav>
${sections}

            <div class="nl-close">
              ${issue.closing.map((p) => `<p>${esc(p)}</p>`).join("\n              ")}
              <p class="signoff"><img src="/assets/logo-mark.svg" alt="" width="34" height="19" /><span>${esc(site.author.name)}<br /><small>${esc(site.author.role)}</small></span></p>
            </div>
          </div>
        </article>
        <nav class="pager${newer && older ? "" : " pager--single"}" aria-label="More issues">
          ${newer ? `<a class="prev" href="/newsletter/${newer.slug}"><small>← Newer issue</small><strong>${esc(newer.subject)}</strong></a>` : ""}
          ${older ? `<a class="next" href="/newsletter/${older.slug}"><small>Older issue →</small><strong>${esc(older.subject)}</strong></a>` : ""}
        </nav>
      </div>
${subscribeBand(`issue-${issue.slug}`)}
    </main>
${footer()}`;
}

// Email version: table layout and inline styles so it renders in Gmail, Outlook and Apple Mail.
// Images use absolute URLs. Paste into the email service's HTML editor and keep its unsubscribe footer.
function renderIssueEmail(issue, { postsBySlug = new Map() } = {}) {
  const ink = "#1b2a23";
  const muted = "#6b766f";
  const green = "#0e7a50";
  const p = (t, extra = "") => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:${ink};${extra}">${t}</p>`;
  const a = (href, text) => `<a href="${esc(absLink(href))}" style="color:${green};font-weight:600;">${esc(text)}</a>`;
  const label = (text, color, bg) =>
    `<p style="margin:28px 0 8px;"><span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${bg};color:${color};font-size:12px;font-weight:600;">${esc(text)}</span></p>`;
  const box = (inner, bg = "#f7f5ef", border = "#e7e4dc") =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;"><tr><td style="padding:18px 20px;background:${bg};border:1px solid ${border};border-radius:12px;">${inner}</td></tr></table>`;
  const topicColors = {
    conversion: ["#c2410c", "#fff0e6"],
    "product-pages": ["#1d4ed8", "#e9efff"],
    trust: ["#0e7a50", "#e6f5ec"],
    "ai-search": ["#7c3aed", "#f1eaff"],
    catalog: ["#a16207", "#fdf3d7"]
  };

  const body = issue.sections
    .map((section) => {
      const { paragraphs, items, link } = issueBlocks(section);
      const style = section.style || "default";
      const topic = section.topic ? topicBySlug.get(section.topic) : null;
      const post = section.article ? postsBySlug.get(section.article) : null;
      const figure = section.figure ? FIGURES[section.figure] : null;
      const parts = [];
      if (style === "action") parts.push(label("Try this week", "#a16207", "#fdf3d7"));
      else if (style === "updates") parts.push(label("Platform", "#1d4ed8", "#e9efff"));
      else if (topic) parts.push(label(topic.name, ...topicColors[topic.slug]));
      parts.push(`<h2 style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.3;color:${ink};">${esc(section.heading)}</h2>`);
      const inner = paragraphs.map((t) => p(esc(t)));
      if (items.length && style === "updates") {
        inner.push(
          ...items.map((i) =>
            box(`${p(esc(i.text), "margin:0 0 8px;")}${i.href ? `<p style="margin:0;font-size:14px;">${a(i.href, `${i.label || "Read more"} →`)}</p>` : ""}`, "#ffffff")
          )
        );
      } else if (items.length && style === "action") {
        inner.push(
          `<ul style="margin:0 0 4px;padding-left:20px;">${items.map((i) => `<li style="margin:0 0 8px;font-size:16px;line-height:1.55;color:${ink};">${esc(i.text)}</li>`).join("")}</ul>`
        );
      } else if (items.length) {
        inner.push(
          `<ul style="margin:0 0 16px;padding-left:20px;">${items
            .map((i) => `<li style="margin:0 0 8px;font-size:16px;line-height:1.55;color:${ink};">${esc(i.text)}${i.href ? ` ${a(i.href, i.label || "Read more")}` : ""}</li>`)
            .join("")}</ul>`
        );
      }
      if (style === "action") parts.push(box(inner.join("\n"), "#fffaf0", "#f3e3bf"));
      else parts.push(...inner);
      if (section.pullquote)
        parts.push(`<p style="margin:6px 0 18px;padding-left:16px;border-left:3px solid ${green};font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:19px;line-height:1.45;color:${ink};">${esc(section.pullquote)}</p>`);
      if (figure) {
        parts.push(figure.email((html) => box(html, "#ffffff")));
        parts.push(p(esc(figure.caption), `font-size:14px;color:${muted};`));
      }
      if (post) {
        parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px;border:1px solid #e7e4dc;border-radius:12px;"><tr><td style="padding:0;"><a href="${abs(postUrl(post))}"><img src="${abs(cover(post, 800))}" width="600" alt="" style="display:block;width:100%;height:auto;border-radius:12px 12px 0 0;" /></a></td></tr><tr><td style="padding:14px 18px;"><p style="margin:0 0 4px;font-size:12px;color:${muted};text-transform:uppercase;letter-spacing:0.06em;">From the blog</p><p style="margin:0 0 6px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.3;"><a href="${abs(postUrl(post))}" style="color:${ink};text-decoration:none;">${esc(post.title)}</a></p><p style="margin:0;font-size:14px;">${a(postUrl(post), "Read the article →")}</p></td></tr></table>`);
      }
      if (link) parts.push(p(a(link.href, `${link.text} →`)));
      return parts.join("\n");
    })
    .join("\n");

  const toc = issue.sections.map((s) => `<li style="margin:0 0 4px;font-size:15px;color:${ink};">${esc(s.short || s.heading)}</li>`).join("");
  const webUrl = abs(`/newsletter/${issue.slug}`);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(issue.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f2ec;">
<span style="display:none;max-height:0;overflow:hidden;">${esc(issue.preview)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f2ec;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;background:#ffffff;border-radius:16px;border:1px solid #e7e4dc;">
<tr><td bgcolor="#e8f6ee" style="padding:22px 28px 24px;background:#e8f6ee;border-radius:16px 16px 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-size:14px;font-weight:700;color:${ink};"><img src="${abs("/assets/logo-mark-email.png")}" width="28" height="15" alt="" style="vertical-align:middle;margin-right:8px;" />Merchants Digest</td>
<td align="right" style="font-size:13px;color:${muted};">Issue ${issue.number} · ${esc(issue.label)}</td>
</tr></table>
<h1 style="margin:18px 0 8px;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.2;color:${ink};">${esc(issue.subject)}</h1>
<p style="margin:0;font-size:15px;line-height:1.5;color:#3f5a4c;">${esc(issue.preview)}</p>
</td></tr>
<tr><td style="padding:26px 28px 8px;">
${p(esc(issue.greeting))}
${issue.intro.map((t) => p(esc(t))).join("\n")}
${box(`<p style="margin:0 0 8px;font-size:12px;font-weight:600;color:${muted};text-transform:uppercase;letter-spacing:0.06em;">In this issue</p><ol style="margin:0;padding-left:20px;">${toc}</ol>`)}
${body}
${issue.closing.map((t) => p(esc(t))).join("\n")}
${p(`<strong>${esc(site.author.name)}</strong><br /><span style="color:${muted};font-size:14px;">${esc(site.author.role)}</span>`)}
</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid #e7e4dc;font-size:13px;color:${muted};"><a href="${webUrl}" style="color:${muted};">Read this issue on the web</a> · <a href="${site.origin}" style="color:${muted};">merchantsdigest.com</a></td></tr>
</table>
</td></tr></table>
</body>
</html>
`;
}

function renderIssueText(issue, { postsBySlug = new Map() } = {}) {
  const lines = [`Subject: ${issue.subject}`, `Preview: ${issue.preview}`, "", issue.greeting, ""];
  issue.intro.forEach((t) => lines.push(t, ""));
  lines.push("IN THIS ISSUE", ...issue.sections.map((s, i) => `${i + 1}. ${s.short || s.heading}`), "");
  for (const section of issue.sections) {
    const { paragraphs, items, link } = issueBlocks(section);
    lines.push(section.heading.toUpperCase(), "");
    paragraphs.forEach((t) => lines.push(t, ""));
    if (items.length) lines.push(...items.map((i) => `- ${i.text}${i.href ? ` ${absLink(i.href)}` : ""}`), "");
    if (section.pullquote) lines.push(`"${section.pullquote}"`, "");
    if (section.figure && FIGURES[section.figure]) lines.push(FIGURES[section.figure].caption, "");
    const post = section.article ? postsBySlug.get(section.article) : null;
    if (post) lines.push(`From the blog: ${post.title} ${abs(postUrl(post))}`, "");
    if (link) lines.push(`${link.text}: ${absLink(link.href)}`, "");
  }
  issue.closing.forEach((t) => lines.push(t, ""));
  lines.push(site.author.name, site.author.role, "", `Read on the web: ${abs(`/newsletter/${issue.slug}`)}`);
  return `${lines.join("\n")}\n`;
}

export async function loadIssues() {
  const dir = path.join(root, "content", "newsletter");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  const issues = await Promise.all(files.map((f) => readJson(path.join(dir, f))));
  issues.sort((a, b) => a.date.localeCompare(b.date));
  issues.forEach((issue, index) => (issue.number = index + 1));
  return issues.reverse();
}

function renderPrivacy(fragment) {
  const body = fragment.replace(/<!--[\s\S]*?-->\s*/g, "");
  return `${head({
    title: "Privacy policy",
    description: "Merchants Digest privacy policy and how we handle subscriber data.",
    canonical: "/privacy-policy",
    schema: { "@context": "https://schema.org", "@graph": [organization, website] }
  })}${header("privacy")}
    <main id="main" class="wrap">
      <div class="doc">
        <header class="page-head">
          <span class="kicker">Legal</span>
          <h1>Privacy policy</h1>
        </header>
        <div class="prose">
${body}
        </div>
      </div>
    </main>
${footer()}`;
}

function render404(posts) {
  return `${head({
    title: "Page not found",
    description: "That page does not exist. Browse the latest Merchants Digest articles instead.",
    canonical: "/404",
    schema: { "@context": "https://schema.org", "@graph": [organization, website] },
    extraHead: '<meta name="robots" content="noindex" />'
  })}${header("")}
    <main id="main" class="wrap">
      <section class="notfound">
        <span class="kicker">404</span>
        <h1>This page isn't on the shelf.</h1>
        <p>The link may be old or mistyped. The newest articles are below, or browse everything in the archive.</p>
        <a class="button" href="/blogs">Browse all articles</a>
      </section>
      <section class="topic-block">
        <div class="section-head"><h2>Recently published</h2></div>
        <div class="grid grid--3">${posts.slice(0, 3).map((p) => card(p)).join("")}
        </div>
      </section>
    </main>
${footer()}`;
}

function renderFeed(posts) {
  const items = posts
    .slice(0, 30)
    .map(
      (p) => `    <item>
      <title>${esc(p.title)}</title>
      <link>${abs(postUrl(p))}</link>
      <guid isPermaLink="true">${abs(postUrl(p))}</guid>
      <pubDate>${rfc822(p.publishDate)}</pubDate>
      <category>${esc(topicBySlug.get(p.topic)?.name || "")}</category>
      <description>${esc(p.excerpt)}</description>
    </item>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(site.name)}</title>
    <link>${site.origin}</link>
    <description>${esc(site.description)}</description>
    <language>en</language>
    <atom:link href="${abs("/feed.xml")}" rel="self" type="application/rss+xml" />
    <lastBuildDate>${rfc822(posts[0].publishDate)}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

function renderSitemap(posts, issues) {
  const latest = posts[0].publishDate;
  const urls = [
    ["/", latest],
    ["/blogs", latest],
    ...topics.map((t) => [topicUrl(t), posts.find((p) => p.topic === t.slug)?.publishDate || latest]),
    ...posts.map((p) => [postUrl(p), p.updatedDate || p.publishDate]),
    ["/newsletter", null],
    ...issues.map((i) => [`/newsletter/${i.slug}`, null]),
    ["/privacy-policy", null]
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, d]) => `  <url><loc>${abs(u)}</loc>${d ? `<lastmod>${d}</lastmod>` : ""}</url>`).join("\n")}
</urlset>
`;
}

export function renderVercelConfig(posts, issues = []) {
  const rewrites = [
    ["/", "/index.html"],
    ["/home", "/index.html"],
    ["/blogs", "/articles.html"],
    ["/newsletter", "/newsletter.html"],
    ...issues.map((i) => [`/newsletter/${i.slug}`, `/newsletter-${i.slug}.html`]),
    ["/privacy-policy", "/privacy-policy.html"],
    ...topics.map((t) => [topicUrl(t), `/topic-${t.slug}.html`]),
    ...posts.map((p) => [postUrl(p), `/blog-${p.slug}.html`])
  ].map(([source, destination]) => ({ source, destination }));
  const headers = [
    { source: "/images/covers/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=2592000, immutable" }] },
    { source: "/assets/(.*)", headers: [{ key: "Cache-Control", value: "public, max-age=86400" }] }
  ];
  return `${JSON.stringify({ rewrites, headers }, null, 2)}\n`;
}

// ---------- build ----------

export async function loadPublishedPosts() {
  const manifest = await readJson(path.join(agentDir, "blog-manifest.json"));
  return manifest.posts
    .filter((p) => p.status === "published")
    .sort((a, b) => b.publishDate.localeCompare(a.publishDate) || a.slug.localeCompare(b.slug));
}

export async function buildSite({ quiet = false } = {}) {
  const posts = await loadPublishedPosts();
  if (!posts.length) throw new Error("No published posts in manifest.");
  for (const p of posts) {
    if (!topicBySlug.has(p.topic)) throw new Error(`Post "${p.slug}" has unknown topic "${p.topic}". Add one of: ${topics.map((t) => t.slug).join(", ")}`);
  }

  const written = [];
  const out = async (file, html) => {
    await write(file, html);
    written.push(file);
  };

  for (const [i, post] of posts.entries()) {
    const draft = { ...(await readJson(path.join(agentDir, "drafts", `${post.slug}.json`))), ...post };
    const related = posts.filter((p) => p.topic === post.topic && p.slug !== post.slug).slice(0, 3);
    await out(`blog-${post.slug}.html`, renderPost(draft, { prev: posts[i - 1], next: posts[i + 1], related }));
  }

  await out("index.html", renderHome(posts));
  await out("articles.html", renderArchive(posts));
  for (const topic of topics) await out(`topic-${topic.slug}.html`, renderTopic(topic, posts));
  const issues = await loadIssues();
  const postsBySlug = new Map(posts.map((p) => [p.slug, p]));
  await out("newsletter.html", renderNewsletterIndex(issues));
  await mkdir(path.join(root, "content", "newsletter", "email"), { recursive: true });
  for (const [i, issue] of issues.entries()) {
    await out(`newsletter-${issue.slug}.html`, renderIssue(issue, { newer: issues[i - 1], older: issues[i + 1], postsBySlug }));
    await out(`content/newsletter/email/${issue.slug}.html`, renderIssueEmail(issue, { postsBySlug }));
    await out(`content/newsletter/email/${issue.slug}.txt`, renderIssueText(issue, { postsBySlug }));
  }
  await out("privacy-policy.html", renderPrivacy(await readFile(path.join(root, "content", "pages", "privacy-policy.html"), "utf8")));
  await out("404.html", render404(posts));
  await out("feed.xml", renderFeed(posts));
  await out("sitemap.xml", renderSitemap(posts, issues));
  await out("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${abs("/sitemap.xml")}\n`);
  await out("vercel.json", renderVercelConfig(posts, issues));

  if (!quiet) console.log(`Built ${written.length} files from ${posts.length} published posts.`);
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await stat(path.join(agentDir, "blog-manifest.json"));
  await buildSite();
}
