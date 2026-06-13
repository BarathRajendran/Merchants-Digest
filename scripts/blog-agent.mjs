import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const cwd = process.cwd();
const agentDir = path.join(cwd, "content", "blog-agent");
const manifestPath = path.join(agentDir, "blog-manifest.json");
const draftsDir = path.join(agentDir, "drafts");
const previewsDir = path.join(agentDir, "previews");
const imageBriefsDir = path.join(agentDir, "image-briefs");
const blogImageDir = path.join(cwd, "images", "Blogs");
const siteOrigin = "https://www.merchantsdigest.com";

const weekdayMap = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6
};

const staticRewrites = [
  ["/", "/index.html"],
  ["/home", "/index.html"],
  ["/blogs", "/articles.html"],
  ["/newsletter", "/newsletter.html"],
  ["/newsletter/jan-2026", "/newsletter-jan-2026.html"],
  ["/newsletter/feb-2026", "/newsletter-feb-2026.html"],
  ["/privacy-policy", "/privacy-policy.html"]
];

async function main() {
  const [command = "help", ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  await ensureAgentDirs();

  switch (command) {
    case "help":
      printHelp();
      return;
    case "research":
      await researchTopics(args);
      return;
    case "draft":
      await createDraft(args);
      return;
    case "queue":
      await queueBlogs(args);
      return;
    case "approve":
      await updateStatus(args, "approved");
      return;
    case "publish":
      await publishDraft(args);
      return;
    case "release":
      await releaseScheduled(args);
      return;
    case "sync":
      await syncDerivedFiles(await loadManifest());
      console.log("Synced articles.html and vercel.json from published manifest entries.");
      return;
    case "run":
      await runFullPipeline(args);
      return;
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

function printHelp() {
  console.log(`Merchants Digest blog agent

Commands:
  npm run blog:research -- --count 3 [--focus "topic area"]
  npm run blog:draft -- --topic "Topic" [--angle "..."] [--publish-date YYYY-MM-DD]
  npm run blog:queue -- --count 2 --days Tuesday,Thursday [--auto-approve]
  npm run blog:approve -- --slug my-slug
  npm run blog:publish -- --draft my-slug
  npm run blog:release [--date YYYY-MM-DD]
  npm run blog:sync
  npm run blog:run -- --count 2 --days Tuesday,Thursday [--focus "topic area"] [--auto-approve]

Environment:
  OPENAI_API_KEY      required for research and drafting
  BLOG_AGENT_MODEL    optional, defaults to gpt-5.5
  BLOG_AGENT_COUNTRY  optional, defaults to US
  BLOG_AGENT_CITY     optional
  BLOG_AGENT_REGION   optional
`);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

async function ensureAgentDirs() {
  await mkdir(draftsDir, { recursive: true });
  await mkdir(previewsDir, { recursive: true });
  await mkdir(imageBriefsDir, { recursive: true });
  await mkdir(blogImageDir, { recursive: true });
}

async function researchTopics(args) {
  const count = toPositiveInt(args.count, 3);
  const focus = args.focus || "Shopify merchant growth, conversion, SEO, AEO, trust, AI visibility, retention, merchandising";
  const publishWindow = args["publish-window"] || "next 2 weeks";

  const systemPrompt = await readText(path.join(agentDir, "prompt-research-system.txt"));
  const userPrompt = `Research ${count} blog topic opportunities for Merchants Digest.

Focus area: ${focus}
Publishing window: ${publishWindow}
Audience: Shopify merchants, operators, and founders.

Return JSON with exactly this shape:
{
  "topics": [
    {
      "topic": "string",
      "angle": "string",
      "whyNow": "string",
      "seoRationale": "string",
      "aeoRationale": "string",
      "humanHook": "string",
      "suggestedTitle": "string",
      "sourceNotes": [
        {
          "title": "string",
          "url": "https://...",
          "note": "string"
        }
      ]
    }
  ]
}`;

  const responseText = await callOpenAI({
    instructions: systemPrompt,
    input: userPrompt,
    tools: [
      {
        type: "web_search",
        search_context_size: "low",
        user_location: buildUserLocation()
      }
    ],
    toolChoice: "required"
  });

  const research = parseJson(responseText);
  console.log(JSON.stringify(research, null, 2));
}

async function createDraft(args) {
  const topic = args.topic;
  if (!topic) {
    throw new Error("Missing --topic");
  }

  const draft = await buildDraftFromBrief({
    topic,
    angle: args.angle || "Operator-focused analysis with practical takeaways",
    publishDate: args["publish-date"] || todayIso(),
    closingCta: args["closing-cta"] || "Tell merchants what to fix first this week.",
    sourceNotes: args["source-notes"] || "None supplied.",
    imageMode: args["image-mode"] || "branded-editorial"
  });

  await persistDraftArtifacts(draft);
  console.log(`Draft saved: ${path.join(draftsDir, `${draft.slug}.json`)}`);
  console.log(`Preview saved: ${path.join(previewsDir, `${draft.slug}.html`)}`);
  console.log(`Image brief saved: ${path.join(imageBriefsDir, `${draft.slug}.md`)}`);
}

async function queueBlogs(args) {
  const count = toPositiveInt(args.count, 2);
  const days = parseScheduleDays(args.days);
  const focus = args.focus || "Shopify merchant growth, conversion, AI search, buyer trust, merchandising, retention";
  const autoApprove = Boolean(args["auto-approve"]);
  const topicsPayload = await getTopicPlan({ count, focus });
  const scheduledDates = buildScheduleDates(days, count, args["start-date"]);
  const manifest = await loadManifest();

  for (let index = 0; index < count; index += 1) {
    const idea = topicsPayload.topics[index];
    const scheduledDate = scheduledDates[index];
    const draft = await buildDraftFromBrief({
      topic: idea.topic,
      angle: idea.angle,
      publishDate: scheduledDate,
      closingCta: "Close with a practical next step merchants can do this week.",
      sourceNotes: formatSourceNotes(idea.sourceNotes),
      imageMode: "branded-editorial"
    });

    draft.research = {
      whyNow: idea.whyNow,
      seoRationale: idea.seoRationale,
      aeoRationale: idea.aeoRationale,
      humanHook: idea.humanHook,
      sourceNotes: idea.sourceNotes
    };
    draft.status = autoApprove ? "approved" : "scheduled";
    draft.scheduledDate = scheduledDate;

    await persistDraftArtifacts(draft);
    upsertManifestEntry(manifest, buildManifestEntryFromDraft(draft));
  }

  await saveManifest(manifest);
  await syncDerivedFiles(manifest);
  console.log(`Queued ${count} blog drafts.`);
}

async function updateStatus(args, nextStatus) {
  const slug = args.slug;
  if (!slug) {
    throw new Error("Missing --slug");
  }

  const manifest = await loadManifest();
  const entry = manifest.posts.find((post) => post.slug === slug);
  if (!entry) {
    throw new Error(`No manifest entry found for slug: ${slug}`);
  }

  entry.status = nextStatus;
  await saveManifest(manifest);
  console.log(`Updated ${slug} to status: ${nextStatus}`);
}

async function publishDraft(args) {
  const draftArg = args.draft;
  if (!draftArg) {
    throw new Error("Missing --draft");
  }

  const draftPath = draftArg.endsWith(".json")
    ? path.resolve(cwd, draftArg)
    : path.join(draftsDir, `${draftArg}.json`);

  const draft = parseJson(await readText(draftPath));
  validateDraft(draft);
  const heroImagePath = await ensureHeroAsset(draft, args["hero-image"]);
  const publishedDate = args["publish-date"] || draft.publishDate || todayIso();

  const finalDraft = {
    ...draft,
    publishDate: publishedDate,
    heroImagePath,
    status: "published"
  };

  const blogFilename = `blog-${draft.slug}.html`;
  const blogFilePath = path.join(cwd, blogFilename);
  await writeFile(blogFilePath, renderBlogPage(finalDraft), "utf8");

  const manifest = await loadManifest();
  upsertManifestEntry(manifest, buildManifestEntryFromDraft(finalDraft));
  await saveManifest(manifest);
  await writeJson(draftPath, finalDraft);
  await syncDerivedFiles(manifest);

  console.log(`Published blog page: ${blogFilePath}`);
  console.log(`Updated manifest: ${manifestPath}`);
}

async function releaseScheduled(args) {
  const date = args.date || todayIso();
  const manifest = await loadManifest();
  const dueEntries = manifest.posts.filter(
    (post) =>
      post.status === "approved" &&
      post.scheduledDate &&
      post.scheduledDate <= date
  );

  if (dueEntries.length === 0) {
    console.log(`No approved posts due on ${date}.`);
    return;
  }

  for (const entry of dueEntries) {
    await publishDraft({
      draft: entry.slug,
      "hero-image": entry.heroImagePath,
      "publish-date": entry.scheduledDate
    });
  }

  console.log(`Released ${dueEntries.length} post(s) for ${date}.`);
}

async function runFullPipeline(args) {
  const queueArgs = {
    ...args,
    "auto-approve": args["auto-approve"] ?? true
  };
  await queueBlogs(queueArgs);
  console.log("Pipeline completed: researched, drafted, and queued posts.");
}

async function getTopicPlan({ count, focus }) {
  const systemPrompt = await readText(path.join(agentDir, "prompt-research-system.txt"));
  const userPrompt = `Research ${count} high-fit topic opportunities for Merchants Digest.

Focus area: ${focus}
Audience: Shopify merchants, operators, and founders.

The topics should be timely, practical, and strong for both SEO and AEO.

Return JSON with exactly this shape:
{
  "topics": [
    {
      "topic": "string",
      "angle": "string",
      "whyNow": "string",
      "seoRationale": "string",
      "aeoRationale": "string",
      "humanHook": "string",
      "suggestedTitle": "string",
      "sourceNotes": [
        {
          "title": "string",
          "url": "https://...",
          "note": "string"
        }
      ]
    }
  ]
}`;

  const responseText = await callOpenAI({
    instructions: systemPrompt,
    input: userPrompt,
    tools: [
      {
        type: "web_search",
        search_context_size: "low",
        user_location: buildUserLocation()
      }
    ],
    toolChoice: "required"
  });

  return parseJson(responseText);
}

async function buildDraftFromBrief({ topic, angle, publishDate, closingCta, sourceNotes, imageMode }) {
  const promptSystem = await readText(path.join(agentDir, "prompt-system.txt"));
  const voiceGuide = await readText(path.join(agentDir, "brand-voice.md"));
  const promptTemplate = await readText(path.join(agentDir, "prompt-user-template.md"));
  const imagePromptSystem = await readText(path.join(agentDir, "prompt-image-system.txt"));
  const userPrompt = promptTemplate
    .replace("{{topic}}", topic)
    .replace("{{angle}}", angle)
    .replace("{{publishDate}}", publishDate)
    .replace("{{closingCta}}", closingCta)
    .replace("{{sourceNotes}}", sourceNotes);

  const responseText = await callOpenAI({
    instructions: `${promptSystem}\n\nBrand voice guide:\n${voiceGuide}`,
    input: userPrompt
  });

  const draft = parseJson(responseText);
  validateDraft(draft);
  if (!draft.slug) {
    draft.slug = slugify(draft.title);
  }

  const imagePromptResponse = await callOpenAI({
    instructions: imagePromptSystem,
    input: `Create a visual brief for this Merchants Digest blog.

Title: ${draft.title}
Topic: ${topic}
Angle: ${angle}
Image mode: ${imageMode}
Lead: ${draft.lead}

Return JSON with exactly this shape:
{
  "archetype": "string",
  "sceneSummary": "string",
  "overlayKicker": "string",
  "imagePrompt": "string",
  "styleNotes": "string",
  "altText": "string"
}`
  });

  const imageBrief = parseJson(imagePromptResponse);
  draft.imageArchetype = imageBrief.archetype || "merchant-workspace";
  draft.imageSceneSummary = imageBrief.sceneSummary || "";
  draft.overlayKicker = imageBrief.overlayKicker || "Shopify merchant brief";
  draft.imagePrompt = imageBrief.imagePrompt;
  draft.imageStyleNotes = imageBrief.styleNotes;
  draft.heroImageAlt = imageBrief.altText || draft.heroImageAlt;
  draft.heroImagePath = `/images/Blogs/generated-${draft.slug}.svg`;
  draft.status = draft.status || "draft";
  draft.scheduledDate = draft.scheduledDate || publishDate;

  return draft;
}

async function persistDraftArtifacts(draft) {
  const draftPath = path.join(draftsDir, `${draft.slug}.json`);
  const previewPath = path.join(previewsDir, `${draft.slug}.html`);
  const imageBriefPath = path.join(imageBriefsDir, `${draft.slug}.md`);

  await writeJson(draftPath, draft);
  await writeFile(previewPath, renderBlogPage(draft), "utf8");
  await writeFile(
    imageBriefPath,
    `# ${draft.title}

Status: ${draft.status}
Scheduled date: ${draft.scheduledDate || "Not scheduled"}

## Prompt
${draft.imagePrompt || "Not generated"}

## Style notes
${draft.imageStyleNotes || "Not generated"}

## Archetype
${draft.imageArchetype || "Not generated"}

## Scene summary
${draft.imageSceneSummary || "Not generated"}

## Overlay kicker
${draft.overlayKicker || "Not generated"}
`,
    "utf8"
  );

  const svgPath = path.join(blogImageDir, `generated-${draft.slug}.svg`);
  await writeFile(
    svgPath,
    buildCoverSvg({
      title: draft.title,
      styleNotes: draft.imageStyleNotes,
      archetype: draft.imageArchetype,
      sceneSummary: draft.imageSceneSummary,
      kicker: draft.overlayKicker
    }),
    "utf8"
  );
}

async function ensureHeroAsset(draft, overridePath) {
  if (overridePath) {
    return overridePath;
  }

  if (draft.heroImagePath && !draft.heroImagePath.endsWith(".svg")) {
    return draft.heroImagePath;
  }

  const defaultPath = `/images/Blogs/generated-${draft.slug}.svg`;
  const svgPath = path.join(blogImageDir, `generated-${draft.slug}.svg`);
  await writeFile(
    svgPath,
    buildCoverSvg({
      title: draft.title,
      styleNotes: draft.imageStyleNotes,
      archetype: draft.imageArchetype,
      sceneSummary: draft.imageSceneSummary,
      kicker: draft.overlayKicker
    }),
    "utf8"
  );
  return defaultPath;
}

async function syncDerivedFiles(manifest) {
  const publishedPosts = sortPosts((manifest.posts || []).filter((post) => post.status === "published"));
  await writeFile(path.join(cwd, "articles.html"), renderArticlesPage(publishedPosts), "utf8");
  await writeFile(path.join(cwd, "vercel.json"), renderVercelConfig(publishedPosts), "utf8");
}

async function loadManifest() {
  const manifest = parseJson(await readText(manifestPath));
  manifest.posts = sortPosts(manifest.posts || []);
  return manifest;
}

async function saveManifest(manifest) {
  manifest.posts = sortPosts(manifest.posts || []);
  await writeJson(manifestPath, manifest);
}

function upsertManifestEntry(manifest, nextEntry) {
  const remaining = (manifest.posts || []).filter((post) => post.slug !== nextEntry.slug);
  remaining.push(nextEntry);
  manifest.posts = sortPosts(remaining);
}

function buildManifestEntryFromDraft(draft) {
  return {
    title: draft.title,
    slug: draft.slug,
    description: draft.description,
    excerpt: draft.excerpt,
    publishDate: draft.publishDate,
    scheduledDate: draft.scheduledDate || draft.publishDate,
    readTimeMinutes: draft.readTimeMinutes,
    heroImagePath: draft.heroImagePath,
    heroImageAlt: draft.heroImageAlt,
    imagePrompt: draft.imagePrompt,
    imageStyleNotes: draft.imageStyleNotes,
    featured: Boolean(draft.featured),
    status: draft.status || "draft"
  };
}

function sortPosts(posts) {
  return [...posts].sort((left, right) => {
    const leftDate = left.scheduledDate || left.publishDate || "0000-00-00";
    const rightDate = right.scheduledDate || right.publishDate || "0000-00-00";
    return rightDate.localeCompare(leftDate);
  });
}

async function callOpenAI({ instructions, input, tools, toolChoice }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const model = process.env.BLOG_AGENT_MODEL || "gpt-5.5";
  const payload = {
    model,
    reasoning: { effort: "medium" },
    instructions,
    input
  };

  if (tools) {
    payload.tools = tools;
  }

  if (toolChoice) {
    payload.tool_choice = toolChoice;
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  if (!body.output_text) {
    throw new Error("OpenAI response did not include output_text.");
  }

  return body.output_text;
}

function buildUserLocation() {
  return {
    type: "approximate",
    approximate: {
      country: process.env.BLOG_AGENT_COUNTRY || "US",
      city: process.env.BLOG_AGENT_CITY || "San Francisco",
      region: process.env.BLOG_AGENT_REGION || "California"
    }
  };
}

function validateDraft(draft) {
  const required = [
    "title",
    "slug",
    "description",
    "excerpt",
    "publishDate",
    "readTimeMinutes",
    "heroImageAlt",
    "lead",
    "introParagraphs",
    "sections"
  ];

  for (const key of required) {
    if (!(key in draft)) {
      throw new Error(`Draft is missing required key: ${key}`);
    }
  }

  if (!Array.isArray(draft.introParagraphs) || draft.introParagraphs.length === 0) {
    throw new Error("introParagraphs must be a non-empty array.");
  }

  if (!Array.isArray(draft.sections) || draft.sections.length < 4) {
    throw new Error("sections must contain at least 4 sections.");
  }
}

function renderBlogPage(draft) {
  const tocHtml = draft.sections
    .map((section) => `<li><a href="#${escapeHtmlAttr(slugify(section.heading))}">${escapeHtml(section.heading)}</a></li>`)
    .join("\n");
  const introHtml = draft.introParagraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("\n      ");

  const sectionsHtml = draft.sections
    .map((section) => {
      const callout = section.callout
        ? `\n        <div class="callout">${escapeHtml(section.callout)}</div>`
        : "";
      const bullets = Array.isArray(section.bullets) && section.bullets.length > 0
        ? `\n        <ul class="bullets">\n${section.bullets
            .map((bullet) => `          <li>${escapeHtml(bullet)}</li>`)
            .join("\n")}\n        </ul>`
        : "";
      const paragraphs = (section.paragraphs || [])
        .map((paragraph) => `        <p>${escapeHtml(paragraph)}</p>`)
        .join("\n");
      return `      <section class="section" id="${escapeHtmlAttr(slugify(section.heading))}">
        <h2>${escapeHtml(section.heading)}</h2>${callout}
${paragraphs}${bullets}
      </section>`;
    })
    .join("\n\n");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(draft.title)}</title>
    <meta name="description" content="${escapeHtmlAttr(draft.description)}" />
    <script type="application/ld+json">
      ${buildBlogSchema(draft)}
    </script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-5FQK2WSDWH"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag() {
        dataLayer.push(arguments);
      }
      gtag("js", new Date());
      gtag("config", "G-5FQK2WSDWH");
    </script>
    <style>
      :root {
        --ink: #111114;
        --ink-muted: #4a4b57;
        --paper: #ffffff;
        --paper-soft: #f6f4ee;
        --line: rgba(17, 17, 20, 0.08);
        --accent: #123f35;
        --accent-soft: #e8f0ed;
        --shadow: 0 18px 40px rgba(17, 17, 20, 0.08);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Space Grotesk", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(243, 235, 218, 0.85), transparent 32%),
          linear-gradient(180deg, #fcfbf7 0%, #ffffff 18%);
      }

      h1,
      h2 {
        font-family: "Fraunces", Georgia, serif;
        margin: 0;
      }

      p {
        color: var(--ink-muted);
        line-height: 1.75;
        margin: 0;
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      .nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 26px 6vw;
        position: sticky;
        top: 0;
        z-index: 10;
        backdrop-filter: blur(16px);
        background: rgba(255, 255, 255, 0.82);
      }

      .brand-logo {
        height: 44px;
        width: auto;
        display: block;
        border: none;
      }

      .nav-links {
        display: flex;
        align-items: center;
        gap: 22px;
        font-weight: 500;
        font-size: 15px;
      }

      .nav-links a {
        opacity: 0.8;
        transition: opacity 0.2s ease;
      }

      .nav-links a:hover {
        opacity: 1;
      }

      .article {
        padding: 36px 6vw 90px;
        display: grid;
        gap: 32px;
        max-width: 1220px;
        margin: 0 auto;
      }

      .article-hero {
        display: grid;
        grid-template-columns: minmax(0, 0.92fr) minmax(320px, 0.88fr);
        gap: 28px;
        align-items: stretch;
      }

      .article-copy,
      .article-image-wrap,
      .article-rail,
      .article-body {
        background: rgba(255, 255, 255, 0.88);
        border: 1px solid var(--line);
        box-shadow: var(--shadow);
      }

      .article-copy {
        border-radius: 30px;
        padding: 34px;
        display: grid;
        gap: 18px;
      }

      .eyebrow {
        font-size: 0.85rem;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: rgba(17, 17, 20, 0.5);
      }

      .article-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        align-items: center;
        color: rgba(17, 17, 20, 0.65);
        font-size: 0.95rem;
      }

      .meta-pill {
        width: fit-content;
        padding: 7px 12px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-weight: 600;
      }

      .title-wrap {
        display: grid;
        gap: 14px;
      }

      .title-wrap h1 {
        font-size: clamp(2.4rem, 4.4vw, 4.3rem);
        line-height: 1.02;
        max-width: 12ch;
      }

      .lead {
        font-size: 1.15rem;
        line-height: 1.75;
      }

      .article-image-wrap {
        border-radius: 30px;
        padding: 16px;
        background: linear-gradient(180deg, #fcf8ef 0%, #ffffff 100%);
      }

      .article-image {
        width: 100%;
        height: 100%;
        min-height: 420px;
        object-fit: cover;
        border-radius: 22px;
        border: 1px solid rgba(17, 17, 20, 0.1);
        box-shadow: 0 18px 30px rgba(17, 17, 20, 0.06);
      }

      .article-layout {
        display: grid;
        grid-template-columns: 250px minmax(0, 1fr);
        gap: 28px;
        align-items: start;
      }

      .article-rail {
        position: sticky;
        top: 96px;
        border-radius: 24px;
        padding: 24px 22px;
        display: grid;
        gap: 18px;
      }

      .rail-kicker {
        font-size: 0.84rem;
        text-transform: uppercase;
        letter-spacing: 0.16em;
        color: rgba(17, 17, 20, 0.45);
      }

      .rail-block {
        display: grid;
        gap: 8px;
      }

      .rail-label {
        font-size: 0.9rem;
        color: rgba(17, 17, 20, 0.5);
      }

      .rail-value {
        font-size: 1rem;
        font-weight: 600;
      }

      .rail-toc {
        display: grid;
        gap: 10px;
        padding-left: 18px;
        margin: 0;
      }

      .rail-toc a {
        color: var(--ink-muted);
      }

      .back-link {
        width: fit-content;
        font-weight: 600;
        color: var(--accent);
      }

      .article-body {
        border-radius: 28px;
        padding: 32px;
        display: grid;
        gap: 28px;
      }

      .body-intro {
        display: grid;
        gap: 16px;
        padding-bottom: 26px;
        border-bottom: 1px solid var(--line);
      }

      .callout {
        padding: 18px 20px;
        border-radius: 16px;
        border: 1px solid rgba(17, 17, 20, 0.12);
        background: #f6f8f7;
        color: #123f35;
        font-weight: 600;
      }

      .bullets {
        display: grid;
        gap: 10px;
        padding-left: 18px;
        margin: 0;
      }

      .bullets li {
        color: var(--ink-muted);
        line-height: 1.7;
      }

      .section {
        display: grid;
        gap: 12px;
      }

      .section h2 {
        font-size: clamp(1.5rem, 2vw, 2rem);
      }

      .section + .section {
        padding-top: 12px;
        border-top: 1px solid rgba(17, 17, 20, 0.06);
      }

      .footer {
        padding: 30px 6vw 50px;
        border-top: 1px solid rgba(17, 17, 20, 0.08);
        display: flex;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .footer small,
      .footer a {
        color: rgba(17, 17, 20, 0.6);
      }

      .footer a:hover {
        text-decoration: underline;
      }

      @media (max-width: 1040px) {
        .article-hero,
        .article-layout {
          grid-template-columns: 1fr;
        }

        .article-rail {
          position: static;
        }
      }

      @media (max-width: 720px) {
        .article-copy,
        .article-image-wrap,
        .article-body,
        .article-rail {
          padding: 22px;
          border-radius: 24px;
        }

        .article-image {
          min-height: 280px;
        }
      }
    </style>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <nav class="nav">
      <a href="/">
        <img class="brand-logo" src="/Primary Logo.png" alt="Merchants Digest" />
      </a>
      <div class="nav-links">
        <a href="/blogs">Blogs</a>
        <a href="/newsletter">Newsletter</a>
      </div>
    </nav>

    <article class="article">
      <section class="article-hero">
        <div class="article-copy">
          <div class="eyebrow">Merchants Digest · Blog</div>
          <div class="article-meta">
            <span class="meta-pill">Shopify operators</span>
            <span>${formatFullDate(draft.publishDate)}</span>
            <span>·</span>
            <span>${draft.readTimeMinutes} min read</span>
          </div>
          <div class="title-wrap">
            <h1>${escapeHtml(draft.title)}</h1>
            <p class="lead">${escapeHtml(draft.lead)}</p>
          </div>
        </div>
        <div class="article-image-wrap">
          <img class="article-image" src="${escapeHtmlAttr(draft.heroImagePath)}" alt="${escapeHtmlAttr(draft.heroImageAlt)}" />
        </div>
      </section>

      <section class="article-layout">
        <aside class="article-rail">
          <a class="back-link" href="/blogs">← Back to blogs</a>
          <div class="rail-block">
            <div class="rail-kicker">Article brief</div>
            <div class="rail-label">Published</div>
            <div class="rail-value">${formatFullDate(draft.publishDate)}</div>
          </div>
          <div class="rail-block">
            <div class="rail-label">Reading time</div>
            <div class="rail-value">${draft.readTimeMinutes} minutes</div>
          </div>
          <div class="rail-block">
            <div class="rail-label">In this article</div>
            <ol class="rail-toc">
${tocHtml}
            </ol>
          </div>
        </aside>

        <div class="article-body">
          <div class="body-intro">
            <div class="eyebrow">What this is really about</div>
            ${introHtml}
          </div>
${sectionsHtml}
        </div>
      </section>
    </article>
    <footer class="footer">
      <small>&copy; 2026 Merchantsdigest.com. Crafted for Shopify merchants.</small>
      <small><a href="/privacy-policy">Privacy Policy</a></small>
    </footer>
  </body>
</html>
`;
}

function renderArticlesPage(posts) {
  if (posts.length === 0) {
    return "<!DOCTYPE html><html><body><p>No published posts yet.</p></body></html>";
  }

  const archiveGroups = groupPostsByMonth(posts);
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteOrigin}/#organization`,
        name: "Merchants Digest",
        url: siteOrigin,
        logo: `${siteOrigin}/Primary%20Logo.png`
      },
      {
        "@type": "WebSite",
        "@id": `${siteOrigin}/#website`,
        url: siteOrigin,
        name: "Merchants Digest",
        publisher: { "@id": `${siteOrigin}/#organization` },
        inLanguage: "en"
      },
      {
        "@type": "Blog",
        "@id": `${siteOrigin}/articles.html#blog`,
        name: "Merchants Digest Blogs",
        url: `${siteOrigin}/articles.html`,
        isPartOf: { "@id": `${siteOrigin}/#website` }
      },
      ...posts.map((post) => ({
        "@type": "BlogPosting",
        "@id": `${siteOrigin}/blog-${post.slug}.html#post`,
        headline: post.title,
        url: `${siteOrigin}/blog-${post.slug}.html`,
        image: `${siteOrigin}${post.heroImagePath}`,
        datePublished: post.publishDate,
        dateModified: post.publishDate,
        publisher: { "@id": `${siteOrigin}/#organization` },
        isPartOf: { "@id": `${siteOrigin}/articles.html#blog` }
      })),
      {
        "@type": "WebPage",
        "@id": `${siteOrigin}/articles.html`,
        url: `${siteOrigin}/articles.html`,
        name: "Articles - Merchants Digest",
        isPartOf: { "@id": `${siteOrigin}/#website` },
        about: { "@id": `${siteOrigin}/#organization` },
        mainEntity: { "@id": `${siteOrigin}/articles.html#blog` }
      }
    ]
  };

  const archiveHtml = archiveGroups
    .map(
      ({ label, posts: groupedPosts }) => `      <section class="archive-group">
        <div class="archive-group-head">
          <h2>${escapeHtml(label)}</h2>
          <span>${groupedPosts.length} article${groupedPosts.length === 1 ? "" : "s"}</span>
        </div>
        <div class="articles-grid">
${groupedPosts
  .map(
    (post) => `          <a class="card-link" href="/blog/${post.slug}">
            <article class="card">
              <div class="thumb">
                <img src="${escapeHtmlAttr(post.heroImagePath)}" alt="${escapeHtmlAttr(post.heroImageAlt)}" />
              </div>
              <div class="card-copy">
                <div class="card-meta">
                  <span>${formatFullDate(post.publishDate)}</span>
                  <span>·</span>
                  <span>${post.readTimeMinutes} min read</span>
                </div>
                <h3>${escapeHtml(post.title)}</h3>
              </div>
            </article>
          </a>`
  )
  .join("\n")}
        </div>
      </section>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Articles - Merchants Digest</title>
    <meta name="description" content="Read Merchants Digest articles built for Shopify merchants." />
    <script type="application/ld+json">
      ${JSON.stringify(graph, null, 2)}
    </script>
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-5FQK2WSDWH"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag() {
        dataLayer.push(arguments);
      }
      gtag("js", new Date());
      gtag("config", "G-5FQK2WSDWH");
    </script>
    <style>
      :root {
        --ink: #111114;
        --ink-muted: #4a4b57;
        --paper: #ffffff;
        --radius: 22px;
        --line: rgba(17, 17, 20, 0.08);
        --accent: #123f35;
        --shadow: 0 12px 28px rgba(17, 17, 20, 0.06);
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: "Space Grotesk", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        color: var(--ink);
        background: #fcfbf8;
      }

      h1,
      h2,
      h3 {
        font-family: "Fraunces", Georgia, serif;
        margin: 0;
      }

      p {
        color: var(--ink-muted);
        line-height: 1.7;
        margin: 0;
      }

      a {
        color: inherit;
        text-decoration: none;
      }

      .nav {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 24px 6vw;
        background: #ffffff;
        border-bottom: 1px solid var(--line);
      }

      .brand-logo {
        height: 44px;
      }

      .nav-links {
        display: flex;
        gap: 22px;
        font-weight: 500;
        font-size: 15px;
      }

      .archive {
        max-width: 1100px;
        margin: 0 auto;
        padding: 28px 6vw 80px;
        display: grid;
        gap: 26px;
      }

      .archive-group {
        display: grid;
        gap: 14px;
      }

      .archive-group-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: baseline;
        border-bottom: 1px solid var(--line);
        padding-bottom: 12px;
        color: rgba(17, 17, 20, 0.62);
      }

      .articles-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 20px;
      }

      .card {
        height: 100%;
        background: #ffffff;
        border-radius: var(--radius);
        padding: 10px 10px 14px;
        box-shadow: none;
        border: 1px solid rgba(17, 17, 20, 0.05);
        display: grid;
        gap: 14px;
      }

      .thumb {
        aspect-ratio: 4 / 3;
        min-height: 0;
        border-radius: 14px;
        overflow: hidden;
        background: #eceff1;
      }

      .thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }

      .card-copy {
        display: grid;
        gap: 10px;
        align-content: start;
        padding: 0 2px;
      }

      .card-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        color: rgba(17, 17, 20, 0.58);
        font-size: 0.92rem;
      }

      .card h3 {
        font-size: 1.08rem;
        line-height: 1.28;
        font-family: "Space Grotesk", "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        font-weight: 600;
      }

      .footer {
        padding: 30px 6vw 50px;
        border-top: 1px solid rgba(17, 17, 20, 0.08);
        display: flex;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      @media (max-width: 960px) {
        .articles-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }

      @media (max-width: 720px) {
        .card {
          padding: 18px;
        }

        .articles-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <nav class="nav">
      <a href="/">
        <img class="brand-logo" src="/Primary Logo.png" alt="Merchants Digest" />
      </a>
      <div class="nav-links">
        <a href="/blogs">Blogs</a>
        <a href="/newsletter">Newsletter</a>
      </div>
    </nav>

    <section class="archive">
${archiveHtml}
    </section>

    <footer class="footer">
      <small>&copy; 2026 Merchantsdigest.com. Crafted for Shopify merchants.</small>
      <small><a href="/privacy-policy">Privacy Policy</a></small>
    </footer>
  </body>
</html>
`;
}

function renderVercelConfig(posts) {
  const rewrites = [
    ...staticRewrites.map(([source, destination]) => ({ source, destination })),
    ...posts.map((post) => ({
      source: `/blog/${post.slug}`,
      destination: `/blog-${post.slug}.html`
    }))
  ];
  return `${JSON.stringify({ rewrites }, null, 2)}\n`;
}

function buildBlogSchema(draft) {
  return JSON.stringify(
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": `${siteOrigin}/#organization`,
          name: "Merchants Digest",
          url: siteOrigin,
          logo: `${siteOrigin}/Primary%20Logo.png`
        },
        {
          "@type": "WebSite",
          "@id": `${siteOrigin}/#website`,
          url: siteOrigin,
          name: "Merchants Digest",
          publisher: { "@id": `${siteOrigin}/#organization` },
          inLanguage: "en"
        },
        {
          "@type": "BlogPosting",
          "@id": `${siteOrigin}/blog-${draft.slug}.html#post`,
          headline: draft.title,
          description: draft.description,
          image: `${siteOrigin}${draft.heroImagePath}`,
          datePublished: draft.publishDate,
          dateModified: draft.publishDate,
          inLanguage: "en",
          mainEntityOfPage: `${siteOrigin}/blog-${draft.slug}.html`,
          publisher: { "@id": `${siteOrigin}/#organization` }
        },
        {
          "@type": "WebPage",
          "@id": `${siteOrigin}/blog-${draft.slug}.html`,
          url: `${siteOrigin}/blog-${draft.slug}.html`,
          name: draft.title,
          isPartOf: { "@id": `${siteOrigin}/#website` },
          about: { "@id": `${siteOrigin}/#organization` },
          mainEntity: { "@id": `${siteOrigin}/blog-${draft.slug}.html#post` }
        }
      ]
    },
    null,
    2
  );
}

function buildCoverSvg({ title, styleNotes = "", archetype = "merchant-workspace", sceneSummary = "", kicker = "Shopify merchant brief" }) {
  const lines = wrapText(title, 28).slice(0, 4);
  const lineTags = lines
    .map(
      (line, index) =>
        `<text x="72" y="${170 + index * 54}" font-size="36" font-family="Georgia, serif" fill="#111114">${escapeXml(line)}</text>`
    )
    .join("");
  const footer = wrapText(styleNotes || "Branded editorial cover", 56).slice(0, 2);
  const footerTags = footer
    .map(
      (line, index) =>
        `<text x="72" y="${728 + index * 26}" font-size="18" font-family="Arial, sans-serif" fill="#4a4b57">${escapeXml(line)}</text>`
    )
    .join("");

  const sceneTags = buildSceneSvg(archetype, sceneSummary);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fbf6e9" />
      <stop offset="100%" stop-color="#e7f2ff" />
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#bg)" />
  <rect x="72" y="72" width="1456" height="756" rx="32" fill="#ffffff" stroke="rgba(17,17,20,0.08)" />
  ${sceneTags}
  <text x="72" y="120" font-size="22" font-family="Arial, sans-serif" fill="#4a4b57" letter-spacing="3">MERCHANTS DIGEST</text>
  ${lineTags}
  <rect x="72" y="676" width="290" height="58" rx="29" fill="#123f35" />
  <text x="112" y="713" font-size="24" font-family="Arial, sans-serif" fill="#ffffff">${escapeXml(kicker)}</text>
  ${footerTags}
</svg>
`;
}

function buildSceneSvg(archetype, sceneSummary) {
  const caption = escapeXml(trimText(sceneSummary || "", 68));

  if (archetype === "policy-operations") {
    return `
  <rect x="900" y="136" width="476" height="620" rx="28" fill="#f4efe7" />
  <rect x="952" y="186" width="372" height="84" rx="16" fill="#ffffff" stroke="#e4ddd3" />
  <rect x="952" y="292" width="372" height="84" rx="16" fill="#ffffff" stroke="#e4ddd3" />
  <rect x="952" y="398" width="372" height="84" rx="16" fill="#ffffff" stroke="#e4ddd3" />
  <rect x="952" y="504" width="372" height="84" rx="16" fill="#ffffff" stroke="#e4ddd3" />
  <rect x="820" y="448" width="230" height="180" rx="22" fill="#d8c1a2" />
  <rect x="836" y="466" width="198" height="140" rx="14" fill="#c79f72" />
  <rect x="1036" y="574" width="164" height="72" rx="12" fill="#ffffff" stroke="#e4ddd3" />
  <circle cx="1260" cy="620" r="46" fill="#214a3a" opacity="0.15" />
  <text x="952" y="664" font-size="16" font-family="Arial, sans-serif" fill="#6b645e">${caption}</text>`;
  }

  if (archetype === "product-decision") {
    return `
  <rect x="880" y="132" width="520" height="626" rx="28" fill="#edf2f7" />
  <rect x="930" y="188" width="420" height="234" rx="22" fill="#ffffff" stroke="#dde4eb" />
  <rect x="960" y="220" width="128" height="128" rx="16" fill="#eceff3" />
  <rect x="1116" y="224" width="176" height="18" rx="9" fill="#111114" opacity="0.85" />
  <rect x="1116" y="254" width="148" height="12" rx="6" fill="#d9dce3" />
  <rect x="1116" y="280" width="164" height="12" rx="6" fill="#d9dce3" />
  <rect x="1116" y="316" width="116" height="24" rx="12" fill="#1f4d8f" opacity="0.14" />
  <rect x="930" y="456" width="420" height="96" rx="18" fill="#ffffff" stroke="#dde4eb" />
  <rect x="930" y="578" width="420" height="96" rx="18" fill="#ffffff" stroke="#dde4eb" />
  <circle cx="857" cy="540" r="84" fill="#dfe8f1" />
  <text x="930" y="722" font-size="16" font-family="Arial, sans-serif" fill="#5a6673">${caption}</text>`;
  }

  if (archetype === "catalog-structure") {
    return `
  <rect x="886" y="132" width="520" height="626" rx="28" fill="#f2eff9" />
  <rect x="934" y="184" width="132" height="160" rx="18" fill="#ffffff" stroke="#e4dff0" />
  <rect x="1080" y="184" width="132" height="160" rx="18" fill="#ffffff" stroke="#e4dff0" />
  <rect x="1226" y="184" width="132" height="160" rx="18" fill="#ffffff" stroke="#e4dff0" />
  <rect x="934" y="362" width="132" height="160" rx="18" fill="#ffffff" stroke="#e4dff0" />
  <rect x="1080" y="362" width="132" height="160" rx="18" fill="#ffffff" stroke="#e4dff0" />
  <rect x="1226" y="362" width="132" height="160" rx="18" fill="#ffffff" stroke="#e4dff0" />
  <rect x="934" y="546" width="424" height="92" rx="18" fill="#ffffff" stroke="#e4dff0" />
  <text x="934" y="704" font-size="16" font-family="Arial, sans-serif" fill="#615a73">${caption}</text>`;
  }

  return `
  <rect x="876" y="132" width="536" height="626" rx="28" fill="#eef2ee" />
  <rect x="930" y="196" width="356" height="244" rx="24" fill="#ffffff" stroke="#dde4df" />
  <rect x="972" y="236" width="272" height="152" rx="16" fill="#edf0f2" />
  <rect x="842" y="482" width="220" height="170" rx="22" fill="#eadfcf" />
  <rect x="1088" y="500" width="290" height="126" rx="22" fill="#ffffff" stroke="#dde4df" />
  <circle cx="1292" cy="214" r="96" fill="#dfe8e3" />
  <text x="930" y="710" font-size="16" font-family="Arial, sans-serif" fill="#5a665f">${caption}</text>`;
}

function trimText(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function parseScheduleDays(daysValue) {
  if (!daysValue) {
    return ["tuesday", "thursday"];
  }

  return daysValue
    .split(",")
    .map((day) => day.trim().toLowerCase())
    .filter(Boolean)
    .map((day) => {
      if (!(day in weekdayMap)) {
        throw new Error(`Unsupported weekday: ${day}`);
      }
      return day;
    });
}

function buildScheduleDates(days, count, startDateValue) {
  const dates = [];
  let cursor = startDateValue ? new Date(`${startDateValue}T00:00:00`) : new Date();
  cursor.setHours(0, 0, 0, 0);

  while (dates.length < count) {
    cursor = addDays(cursor, 1);
    const key = dayName(cursor);
    if (days.includes(key)) {
      dates.push(toIsoDate(cursor));
    }
  }

  return dates;
}

function dayName(date) {
  return Object.keys(weekdayMap).find((name) => weekdayMap[name] === date.getDay());
}

function addDays(date, numberOfDays) {
  const next = new Date(date);
  next.setDate(next.getDate() + numberOfDays);
  return next;
}

function toIsoDate(date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    .toISOString()
    .slice(0, 10);
}

function formatSourceNotes(sourceNotes) {
  if (!Array.isArray(sourceNotes) || sourceNotes.length === 0) {
    return "None supplied.";
  }

  return sourceNotes
    .map((note) => `- ${note.title}: ${note.url} (${note.note})`)
    .join("\n");
}

function formatMonthYear(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  return date.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

function formatFullDate(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  return date.toLocaleString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function groupPostsByMonth(posts) {
  const groups = [];
  for (const post of posts) {
    const label = formatMonthYear(post.publishDate);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === label) {
      lastGroup.posts.push(post);
      continue;
    }

    groups.push({ label, posts: [post] });
  }

  return groups;
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function wrapText(text, maxLength) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxLength && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function toPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || `${fallback}`, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeHtmlAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function escapeXml(value) {
  return escapeHtmlAttr(value);
}

function parseJson(value) {
  return JSON.parse(value);
}

async function readText(filePath) {
  return readFile(filePath, "utf8");
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
