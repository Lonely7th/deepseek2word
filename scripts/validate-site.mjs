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

function parseRobots(content) {
  const groups = [];
  const sitemaps = [];
  let group = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.replace(/\s*#.*$/, "").trim();
    if (!line) continue;
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) continue;
    const directive = match[1].trim().toLowerCase();
    const value = match[2].trim();

    if (directive === "sitemap") {
      sitemaps.push(value);
    } else if (directive === "user-agent") {
      if (!group || group.rules.length) {
        group = { agents: [], rules: [] };
        groups.push(group);
      }
      group.agents.push(value.toLowerCase());
    } else if ((directive === "allow" || directive === "disallow") && group) {
      group.rules.push({ directive, value });
    }
  }

  return { groups, sitemaps };
}

function isAllowed(pathname, rules) {
  const matching = rules
    .filter(({ value }) => value && pathname.startsWith(value))
    .sort((a, b) => b.value.length - a.value.length || (a.directive === "allow" ? -1 : 1));
  return matching[0]?.directive !== "disallow";
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
  if (!/rel="icon"\s+href="\/favicon\.ico"\s+sizes="any"/i.test(html)) failures.push(`${relative}: missing root favicon.ico declaration`);
  if (!/rel="icon"\s+type="image\/png"\s+sizes="32x32"\s+href="\/favicon-32x32\.png"/i.test(html)) failures.push(`${relative}: missing 32x32 favicon declaration`);
  if (!/rel="icon"\s+type="image\/png"\s+sizes="16x16"\s+href="\/favicon-16x16\.png"/i.test(html)) failures.push(`${relative}: missing 16x16 favicon declaration`);
  if (!/rel="apple-touch-icon"\s+sizes="180x180"\s+href="\/apple-touch-icon\.png"/i.test(html)) failures.push(`${relative}: missing apple touch icon declaration`);

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
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) => match[1].trim());
for (const canonical of canonicals.keys()) {
  if (!sitemap.includes(`<loc>${canonical}</loc>`)) failures.push(`sitemap.xml: missing ${canonical}`);
}

try {
  const robots = await fs.readFile(path.join(root, "robots.txt"), "utf8");
  const { groups, sitemaps } = parseRobots(robots);
  const publicGroup = groups.find(({ agents }) => agents.includes("*"));
  const expectedSitemap = sitemapUrls.length ? new URL("/sitemap.xml", sitemapUrls[0]).href : "";

  if (!publicGroup) {
    failures.push("robots.txt: missing User-agent: * rules");
  } else {
    for (const pageUrl of sitemapUrls) {
      const pathname = new URL(pageUrl).pathname;
      if (!isAllowed(pathname, publicGroup.rules)) failures.push(`robots.txt: blocks sitemap page ${pathname}`);
    }
  }
  if (!expectedSitemap || !sitemaps.includes(expectedSitemap)) {
    failures.push(`robots.txt: missing Sitemap: ${expectedSitemap || "URL derived from sitemap.xml"}`);
  }
} catch (error) {
  if (error.code === "ENOENT") failures.push("robots.txt: file is missing");
  else throw error;
}

if (failures.length) {
  console.error(`Validation failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Validated ${htmlFiles.length} HTML pages: titles, descriptions, H1s, canonicals, JSON-LD, local links, images, sitemap and robots.txt are consistent.`);
}
