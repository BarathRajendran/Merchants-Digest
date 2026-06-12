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
