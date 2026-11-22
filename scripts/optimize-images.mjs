// Builds web-sized cover images for every post in the manifest (macOS `sips`).
// Output: images/covers/<slug>-800.jpg (cards) and <slug>-1600.jpg (article hero, social share)
// Usage: node scripts/optimize-images.mjs [--force]
import { readFile, mkdir, stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const force = process.argv.includes("--force");
const outDir = path.join(root, "images", "covers");
await mkdir(outDir, { recursive: true });

const manifest = JSON.parse(await readFile(path.join(root, "content/blog-agent/blog-manifest.json"), "utf8"));
const exists = (p) => stat(p).then(() => true, () => false);

// sips can read but not write WebP, so ship compressed JPEGs.
const variants = [
  { suffix: "-800.jpg", args: ["-s", "format", "jpeg", "-s", "formatOptions", "72", "-Z", "800"] },
  { suffix: "-1600.jpg", args: ["-s", "format", "jpeg", "-s", "formatOptions", "70", "-Z", "1600"] }
];

let made = 0;
for (const post of manifest.posts) {
  if (!post.heroImagePath) continue;
  const source = path.join(root, decodeURIComponent(post.heroImagePath));
  if (!(await exists(source))) {
    console.warn(`missing cover for ${post.slug}: ${post.heroImagePath}`);
    continue;
  }
  for (const v of variants) {
    const target = path.join(outDir, `${post.slug}${v.suffix}`);
    if (!force && (await exists(target))) continue;
    execFileSync("sips", [...v.args, source, "--out", target], { stdio: "ignore" });
    made++;
  }
}
console.log(`cover variants written: ${made}`);
