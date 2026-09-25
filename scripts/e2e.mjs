// End-to-end check in Playwright's Chromium (Google Chrome no longer loads
// unpacked extensions from the command line). Opens tests/fixtures/news.html,
// waits for the model, and reports which blocks were flagged.
// Usage: pnpm build && node scripts/e2e.mjs [url]
// With a url it only lists what was flagged on that page (no expectations).
import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
// Reused between runs so the model is only downloaded once.
const profile = join(root, ".e2e-profile");

const EXPECT_AD = ["native-ad", "chumbox", "sidebar-ad", "late-ad"];
const EXPECT_CONTENT = ["story", "c1", "c2", "newsletter", "related"];

const server = createServer((req, res) => {
  res.setHeader("content-type", "text/html");
  createReadStream(join(root, "tests/fixtures/news.html")).pipe(res);
}).listen(0);
const target = process.argv[2];
const url = target ?? `http://localhost:${server.address().port}/`;

const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  viewport: { width: 1280, height: 900 },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
const page = await context.newPage();
page.on("console", (msg) => {
  if (/ad-spotter|error|warn/i.test(msg.text())) console.log(`[page] ${msg.text()}`);
});
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

const status = () =>
  worker.evaluate(async () => {
    try {
      return await chrome.runtime.sendMessage({ target: "offscreen", type: "status" });
    } catch (error) {
      return { state: "no offscreen yet", message: String(error) };
    }
  });

// Wait for the model (first run downloads ~0.9 GB) and for the late ad.
const deadline = Date.now() + 15 * 60_000;
let last = "";
for (;;) {
  const s = await status();
  const line = s.state === "loading" ? `loading ${Math.round(s.progress * 100)}%` : s.state;
  if (line !== last) console.log(`model: ${line}${s.message ? ` (${s.message})` : ""}`);
  last = line;
  if (s.state === "error") break;
  const lateScored = await page.evaluate(() => document.querySelectorAll("[data-ad-spotter-label]").length > 0 && document.getElementById("late-ad") !== null);
  if (s.state === "ready" && (target ? s.classified > 0 : lateScored)) {
    if (target) await page.waitForTimeout(15000); // let the page's scan queue drain
    await page.waitForTimeout(4000); // let the rescan of the late ad finish
    break;
  }
  if (Date.now() > deadline) throw new Error("timed out waiting for the model");
  await page.waitForTimeout(1000);
}

const flagged = await page.evaluate(() => {
  const out = {};
  for (const el of document.querySelectorAll("[data-ad-spotter-label]")) {
    const owner = el.id || el.closest("[id]")?.id || el.tagName;
    out[owner] = el.getAttribute("data-ad-spotter-label");
  }
  return out;
});
const isFlagged = (id) =>
  page.evaluate((id) => {
    const el = document.getElementById(id);
    return !!el && (el.hasAttribute("data-ad-spotter-label") || el.querySelector("[data-ad-spotter-label]") !== null);
  }, id);

console.log("\nstatus:", JSON.stringify(await status()));
if (target) {
  const rows = await page.evaluate(() =>
    Array.from(document.querySelectorAll("[data-ad-spotter-label]")).map((el) => `${el.getAttribute("data-ad-spotter-label")}  ${(el.innerText || "").replace(/\s+/g, " ").slice(0, 110)}`),
  );
  console.log(`flagged ${rows.length}:\n  ${rows.join("\n  ")}`);
  if (process.env.DUMP) {
    const recent = await worker.evaluate(() => chrome.runtime.sendMessage({ target: "offscreen", type: "recent" }));
    const { writeFileSync } = await import("node:fs");
    writeFileSync(process.env.DUMP, JSON.stringify(recent, null, 2));
    console.log(`wrote ${recent.length} scored blocks to ${process.env.DUMP}`);
  }
  await page.screenshot({ path: join(root, "e2e-screenshot.png") });
  await context.close();
  server.close();
  process.exit(0);
}
console.log("flagged:", flagged);
let failures = 0;
for (const id of EXPECT_AD) if (!(await isFlagged(id))) { failures++; console.log(`  missed ad: #${id}`); }
for (const id of EXPECT_CONTENT) if (await isFlagged(id)) { failures++; console.log(`  false positive: #${id}`); }
await page.screenshot({ path: join(root, "e2e-screenshot.png"), fullPage: true });
console.log(failures ? `\n${failures} mismatch(es)` : "\nall expectations met", "· screenshot: e2e-screenshot.png");

await context.close();
server.close();
process.exit(failures ? 1 : 0);
