import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const ignoredHtml = new Set([
  "baidu_verify_codeva-fiDAMnpqB8.html",
  "baidu_verify_codeva-G3MJeQGU2o.html",
]);

async function walk(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(target));
    else files.push(target);
  }
  return files;
}

function one(html, regex) {
  return html.match(regex)?.[1]?.trim() ?? "";
}

function localTarget(url) {
  const clean = url.split(/[?#]/)[0];
  if (!clean.startsWith("/") || clean.startsWith("//")) return null;
  if (clean === "/") return path.join(root, "index.html");
  const decoded = decodeURIComponent(clean);
  if (path.extname(decoded)) return path.join(root, decoded.slice(1));
  return path.join(root, decoded.slice(1), "index.html");
}

const allFiles = await walk(root);
const htmlFiles = allFiles.filter((file) => file.endsWith(".html") && !ignoredHtml.has(path.basename(file)));
const failures = [];
const titles = new Map();
const canonicals = new Map();

for (const file of htmlFiles) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const html = await fs.readFile(file, "utf8");
  const title = one(html, /<title>([^<]+)<\/title>/i);
  const description = one(html, /<meta\s+name="description"\s+content="([^"]+)"/i);
  const canonical = one(html, /<link\s+rel="canonical"\s+href="([^"]+)"/i);
  const h1Count = (html.match(/<h1\b/gi) || []).length;
  const is404 = relative === "404.html";

  if (!title) failures.push(`${relative}: missing title`);
  if (!description) failures.push(`${relative}: missing meta description`);
  if (h1Count !== 1) failures.push(`${relative}: expected one h1, found ${h1Count}`);
  if (!/<main\b/i.test(html)) failures.push(`${relative}: missing main landmark`);
  if (!is404 && !canonical) failures.push(`${relative}: missing canonical`);
  if (is404 && !/name="robots"\s+content="noindex,follow"/i.test(html)) failures.push(`${relative}: 404 must be noindex,follow`);

  if (titles.has(title)) failures.push(`${relative}: duplicate title with ${titles.get(title)}`);
  titles.set(title, relative);
  if (canonical) {
    if (canonicals.has(canonical)) failures.push(`${relative}: duplicate canonical with ${canonicals.get(canonical)}`);
    canonicals.set(canonical, relative);
  }

  for (const script of html.matchAll(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(script[1]); } catch (error) { failures.push(`${relative}: invalid JSON-LD (${error.message})`); }
  }

  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/gi)) {
    const target = localTarget(match[1]);
    if (!target) continue;
    try { await fs.access(target); } catch { failures.push(`${relative}: broken local reference ${match[1]}`); }
  }

  for (const img of html.matchAll(/<img\b([^>]+)>/gi)) {
    if (!/\bwidth="\d+"/i.test(img[1]) || !/\bheight="\d+"/i.test(img[1])) failures.push(`${relative}: image missing width/height`);
  }
}

const sitemap = await fs.readFile(path.join(root, "sitemap.xml"), "utf8");
for (const canonical of canonicals.keys()) {
  if (!sitemap.includes(`<loc>${canonical}</loc>`)) failures.push(`sitemap.xml: missing ${canonical}`);
}

if (failures.length) {
  console.error(`Validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${htmlFiles.length} HTML pages: titles, descriptions, H1s, canonicals, JSON-LD, local links, images and sitemap are consistent.`);
}
