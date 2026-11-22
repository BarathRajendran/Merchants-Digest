# Merchants Digest Agent Instructions

This repository powers the `Merchants Digest` publishing workflow.

## Core command

When the user says `Run blog` or `Run the blog schedule`, interpret it as a standing operating procedure, not a brainstorming request.

Default meaning:
- create 2 blog posts
- target the next Tuesday and Thursday
- research current topics relevant to Shopify merchants
- prioritize SEO, AEO, conversion, trust, merchandising, AI/search shifts, and merchant operations
- write in the existing Merchants Digest voice
- create image direction and final cover assets
- prepare publishing assets in this repo
- avoid unnecessary clarification questions

Only interrupt the workflow if there is a real blocker:
- source quality is too weak
- image output fails quality rules
- publishing files conflict
- the requested schedule is impossible or ambiguous

## Publishing workflow

For `Run blog`, the expected workflow is:
1. Research current topics and trends
2. Select the strongest 2 topics for merchant relevance and discoverability
3. Draft both posts in Merchants Digest style
4. Create or refresh image briefs and final cover assets
5. Queue the posts for Tuesday and Thursday
6. Update local workflow artifacts in `content/blog-agent/`
7. Preserve the live site until release unless the user explicitly asks to publish immediately

## Writing rules

- Write for Shopify merchants, operators, and founders
- Sound practical, direct, and human
- Avoid generic AI filler and over-polished marketing language
- Prefer real merchant situations and clear trade-offs
- Keep paragraphs short and readable
- Use headings that make concrete promises
- Do not invent studies, quotes, or precise data without a source
- Optimize for people-first usefulness, not keyword stuffing

## Editorial direction (from November 2026)

Merchants Digest competes on things others cannot copy: original research, real examples, tools, and the author's first-hand experience. Generic advice that could appear on any Shopify blog is not good enough.

- Every post must contain at least one piece of evidence: a figure from our own research (`content/research/*/summary.json`), a primary source (Shopify changelog or docs, Google documentation), a worked example, or a link to a Merchants Digest tool
- Where a post's topic overlaps a research study, cite the study's figure and link to it
- The author is anonymous. Refer to them as a former Shopify app founder who has built and run several Shopify apps; never name them or their current employer
- First-person notes from the author are welcome where the app-founder perspective adds something real (apps, scripts, support tickets, installs and uninstalls)
- Never name or identify a store in published content. Use aggregates, or describe an example without details that could identify it
- If second-hand coverage is the only source, say who made the claim
- Prefer charts, diagrams and screenshots of our own tools over AI-generated cover art for new work

## Research workflow

- Candidate lists and per-store results live in `research-data/` (gitignored, never deployed). Nothing store-level is ever committed or published
- `node scripts/research/audit-pdp.mjs research-data/<study>/candidates.txt` runs the product page audit (public pages only, a few requests per store)
- `node scripts/research/summarize-pdp.mjs research-data/<study>/raw.json content/research/<study>/summary.json` writes the aggregate-only summary that the site reads
- Write the report in `content/research/<study>/report.json`. Numbers are pulled from `summary.json` by path; never type figures into the report text by hand without checking them against the summary
- Checks are shared with the public tool in `lib/pdp-checks.mjs`, so the Product page checker (`/tools/product-page-checker`, served by `api/check-product-page.js`) always measures pages the same way the research did

## Image rules

- Do not ship generic AI-looking covers
- Prefer grounded editorial composition over abstract tech metaphors
- Avoid robots, holograms, neon dashboards, floating UI, and plastic-looking humans
- Use the visual system in `content/blog-agent/visual-system.md`
- Use the archetypes in `content/blog-agent/cover-templates.json`
- Reject covers with clipped text, cramped layout, or weak safe areas

## Scheduling defaults

- Default schedule is the next Tuesday and Thursday from the current date
- Default count is 2 posts
- Default state is `approved` and queued, not auto-published
- Preserve this behavior unless the user explicitly asks for immediate publishing

## Files to maintain

When running the workflow, update the relevant files as needed:
- `content/blog-agent/blog-manifest.json`
- `content/blog-agent/drafts/`
- `content/blog-agent/previews/`
- `content/blog-agent/image-briefs/`
- `images/Blogs/`

Do not update `articles.html` or `vercel.json` for queued-only posts unless they are being published.

## Site generator

Every public page is generated. Do not hand-edit `index.html`, `articles.html`, `blog-*.html`, `topic-*.html`, `newsletter*.html`, `privacy-policy.html`, `404.html`, `feed.xml`, `sitemap.xml`, or `vercel.json`: edits are overwritten on the next build.

- Article bodies: `content/blog-agent/drafts/<slug>.json`; post list and status: `blog-manifest.json`
- Every post needs a `topic`: one of `conversion`, `product-pages`, `trust`, `ai-search`, `catalog` (see `scripts/site-config.mjs`). Set it explicitly when drafting; the keyword fallback is only a safety net
- Site copy, topics, and newsletter issues: `scripts/site-config.mjs`; issue bodies: `content/newsletter/`; privacy policy: `content/pages/`
- Templates: `scripts/build-site.mjs`; styles and scripts: `assets/site.css`, `assets/site.js`
- `npm run site:images` makes web-sized covers in `images/covers/` (macOS `sips`); `npm run site:build` regenerates the site; `npm run site:dev` serves it locally with production routes
- `blog:publish`, `blog:release`, and `blog:sync` already run both steps
