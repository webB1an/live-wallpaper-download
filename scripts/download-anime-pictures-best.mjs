/**
 * Anime Pictures best-image downloader.
 *
 * The site blocks plain curl HTML/image downloads, so this script uses a real
 * Playwright browser. It downloads one not-yet-recorded image per run.
 *
 * Examples:
 *   node .\scripts\download-anime-pictures-best.mjs
 *   node .\scripts\download-anime-pictures-best.mjs --type week
 *   node .\scripts\download-anime-pictures-best.mjs --type day --dry-run
 *   node .\scripts\download-anime-pictures-best.mjs --out "D:\Pictures\Anime"
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = "https://anime-pictures.net/?lang=zh-cn";
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const PROJECT_DIR = path.dirname(SCRIPT_DIR);
const CONFIG_DIR = path.join(PROJECT_DIR, "config");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const LABELS = {
  day: ["今日最佳", "Highest rated anime pictures of the day"],
  week: ["本周最佳", "Highest rated anime pictures of the week"],
};

function usage() {
  return `Anime Pictures best-image downloader

Usage:
  node "${SCRIPT_PATH}"
  node "${SCRIPT_PATH}" --type day
  node "${SCRIPT_PATH}" --type week
  node "${SCRIPT_PATH}" --type week --out "D:\\Pictures\\Anime"
  node "${SCRIPT_PATH}" --dry-run

Options:
  -t, --type <day|week>  Select today's or this week's best list. Default: day.
  -o, --out <path>       Save images to this folder. Default: project-folder\\downloads.
  --dry-run              Resolve the next candidate without downloading it.
  -h, --help             Show this help.

Each normal run downloads only the first not-yet-recorded image from the
selected best list. Successful detail URLs are recorded under project-folder\\config.
`;
}

function parseArgs(argv) {
  const options = { type: "day", outDir: path.join(PROJECT_DIR, "downloads"), dryRun: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") options.help = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "-t" || arg === "--type") {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires day or week.`);
      options.type = value.toLowerCase();
      i += 1;
    } else if (arg.startsWith("--type=")) options.type = arg.slice("--type=".length).toLowerCase();
    else if (arg === "-o" || arg === "--out") {
      const value = argv[i + 1];
      if (!value) throw new Error(`${arg} requires a folder path.`);
      options.outDir = path.resolve(value);
      i += 1;
    } else if (arg.startsWith("--out=")) options.outDir = path.resolve(arg.slice("--out=".length));
    else throw new Error(`Unknown option: ${arg}\n\n${usage()}`);
  }
  if (!LABELS[options.type]) throw new Error(`Type must be day or week, got: ${options.type}`);
  return options;
}

function sanitizeFilenamePart(value) {
  return value
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80);
}

function normalizeDetailUrl(value) {
  const parsed = new URL(value, ROOT);
  parsed.hash = "";
  parsed.search = "";
  parsed.searchParams.set("lang", "zh-cn");
  return parsed.href;
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function existingPath(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function getExtension(downloadUrl, suggestedFilename) {
  const fromSuggested = path.extname(suggestedFilename || "");
  if (fromSuggested) return fromSuggested;
  const fromUrl = path.extname(new URL(downloadUrl).pathname);
  return fromUrl || ".jpg";
}

async function makeOutputPath(outDir, tags, postId, extension) {
  const nameParts = tags.map(sanitizeFilenamePart).filter(Boolean).slice(0, 5);
  const base = nameParts.join("__") || `anime-pictures-${postId || "image"}`;
  const firstPath = path.join(outDir, `${base}${extension}`);
  if (!(await existingPath(firstPath))) return firstPath;
  return path.join(outDir, `${base}__post-${postId || Date.now()}${extension}`);
}

async function getBestDetailUrls(page, type) {
  const labels = LABELS[type];
  return page.evaluate((expectedLabels) => {
    const label = [...document.querySelectorAll("div, h2, h3, span")].find((node) =>
      expectedLabels.includes(node.textContent?.trim() || ""),
    );
    if (!label?.parentElement) return [];
    const seen = new Set();
    return [...label.parentElement.querySelectorAll('a[href*="/posts/"]')]
      .map((link) => link.href)
      .filter((href) => /\/posts\/\d+/.test(href))
      .filter((href) => (seen.has(href) ? false : (seen.add(href), true)));
  }, labels);
}

async function getDetailInfo(page, detailUrl) {
  await page.goto(detailUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.locator(".tags a").first().waitFor({ state: "visible", timeout: 120000 });
  return page.evaluate(() => {
    const tags = [...document.querySelectorAll(".tags a")]
      .map((link) => link.textContent?.trim())
      .filter(Boolean)
      .slice(0, 5);
    const downloadLink = document.querySelector('a[href*="/pictures/download_image/"]');
    return {
      tags,
      downloadUrl: downloadLink?.href || null,
      title: document.title,
    };
  });
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  console.log(usage());
  process.exit(0);
}

const manifestPath = path.join(CONFIG_DIR, "manifest-anime-pictures.json");
const historyPath = path.join(CONFIG_DIR, "downloaded-anime-pictures-detail-urls.json");

await mkdir(options.outDir, { recursive: true });
await mkdir(CONFIG_DIR, { recursive: true });

const history = await readJsonFile(historyPath, []);
const recordsByUrl = new Map(history.filter((record) => record?.detailUrl).map((record) => [normalizeDetailUrl(record.detailUrl), record]));
const results = [];
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, userAgent: USER_AGENT });
const page = await context.newPage();

try {
  console.log(`Best list: ${options.type}`);
  await page.goto(ROOT, { waitUntil: "domcontentloaded", timeout: 120000 });
  const detailUrls = (await getBestDetailUrls(page, options.type)).map(normalizeDetailUrl);
  if (!detailUrls.length) throw new Error(`No ${options.type} best-list post links found on Anime Pictures.`);

  for (const detailUrl of detailUrls) {
    if (recordsByUrl.has(detailUrl)) {
      results.push({ detailUrl, type: options.type, status: "skipped-detail-url" });
      continue;
    }

    const detail = await getDetailInfo(page, detailUrl);
    const postId = detailUrl.match(/\/posts\/(\d+)/)?.[1] || null;
    if (!detail.downloadUrl || detail.tags.length === 0) {
      results.push({ detailUrl, postId, type: options.type, ...detail, status: "missing-detail-data" });
      continue;
    }

    if (options.dryRun) {
      results.push({ detailUrl, postId, type: options.type, ...detail, status: "dry-run" });
      console.log(`Would download post ${postId}: ${detail.tags.join(" | ")}`);
      break;
    }

    const downloadPromise = page.waitForEvent("download", { timeout: 120000 });
    await page.locator('a[href*="/pictures/download_image/"]').first().click();
    const download = await downloadPromise;
    const extension = getExtension(detail.downloadUrl, download.suggestedFilename());
    const filePath = await makeOutputPath(options.outDir, detail.tags, postId, extension);
    await download.saveAs(filePath);

    const record = {
      detailUrl,
      postId,
      type: options.type,
      tags: detail.tags,
      downloadUrl: detail.downloadUrl,
      filePath,
      recordedAt: new Date().toISOString(),
      status: "downloaded",
    };
    recordsByUrl.set(detailUrl, record);
    results.push(record);
    console.log(`Downloaded post ${postId}: ${filePath}`);
    break;
  }

  if (!results.some((result) => result.status === "downloaded" || result.status === "dry-run")) {
    console.log(`No new ${options.type} best-list image found.`);
  }
} finally {
  await browser.close();
}

await writeFile(manifestPath, JSON.stringify(results, null, 2), "utf8");
await writeFile(historyPath, JSON.stringify([...recordsByUrl.values()], null, 2), "utf8");
console.log(`Manifest: ${manifestPath}`);
console.log(`URL record: ${historyPath}`);
