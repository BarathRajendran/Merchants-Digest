# Merchants Digest

Static publishing site for `Merchants Digest`, focused on Shopify merchant blogs and newsletter archives.

## Blog agent

The repo now includes a zero-dependency blog agent that can:

- research current topic opportunities with web-backed search
- generate a structured blog draft with the OpenAI Responses API
- save the draft JSON and preview HTML
- generate an image brief for each post
- queue drafts for scheduled release
- mark drafts approved and release them when due
- publish a new standalone blog page
- generate a default blog cover SVG when no custom image is supplied
- update `articles.html`
- update `vercel.json`

## Standing command

This repo now treats:

`Run blog`

as a standing workflow, not a vague request.

The durable rules live in:

- `AGENTS.md`
- `content/blog-agent/run-blog-workflow.md`

Default behavior:
- research 2 strong current topics
- draft 2 posts
- target the next Tuesday and Thursday
- create image briefs and final cover assets
- queue everything with minimal manual intervention

### Commands

```bash
npm run blog:help
```

```bash
export OPENAI_API_KEY="your-key"
npm run blog:research -- --count 3 --focus "Shopify SEO and buyer trust"
```

```bash
export OPENAI_API_KEY="your-key"
npm run blog:draft -- --topic "Why Shopify merchants should care about PDP clarity" --angle "Explain why clarity beats more copy" --publish-date 2026-06-12
```

```bash
npm run blog:queue -- --count 2 --days Tuesday,Thursday
```

```bash
npm run blog:approve -- --slug why-shopify-merchants-should-care-about-pdp-clarity
```

```bash
npm run blog:release -- --date 2026-06-16
```

```bash
npm run blog:publish -- --draft why-shopify-merchants-should-care-about-pdp-clarity
```

```bash
npm run blog:run -- --count 2 --days Tuesday,Thursday --focus "Shopify SEO, AEO, and conversion clarity"
```

```bash
npm run blog:sync
```

### Agent files

- `content/blog-agent/brand-voice.md`
- `content/blog-agent/prompt-system.txt`
- `content/blog-agent/prompt-research-system.txt`
- `content/blog-agent/prompt-image-system.txt`
- `content/blog-agent/visual-system.md`
- `content/blog-agent/cover-templates.json`
- `content/blog-agent/prompt-user-template.md`
- `content/blog-agent/blog-manifest.json`
- `scripts/blog-agent.mjs`

### Workflow

1. Research topics
2. Draft or queue posts
3. Review the JSON in `content/blog-agent/drafts/`
4. Check preview HTML in `content/blog-agent/previews/`
5. Review image briefs in `content/blog-agent/image-briefs/`
6. Approve queued posts
7. Run release on the scheduled date

The publish step writes the final page to the repo root as `blog-<slug>.html` and refreshes the blog index and Vercel rewrites from the published entries in the manifest.
