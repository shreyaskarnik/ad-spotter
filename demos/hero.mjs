// Records a short looping "hero" clip for social posts: scan beam, real
// detections popping in, ads collapsing away. The beam, chip, captions and
// collapse animation are decoration injected into the page for the video;
// which blocks get flagged, and their scores, come from the extension.
// Usage: pnpm build && node demos/hero.mjs   → videos/hero.webm (+ timing)
import { createReadStream, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const dist = path.join(root, "dist");
const profile = path.join(root, ".e2e-profile");
const out = path.join(root, "videos");
const W = 1280;
const H = 720;

const server = createServer((_req, res) => {
  res.setHeader("content-type", "text/html");
  createReadStream(path.join(root, "demos/assets/news.html")).pipe(res);
}).listen(0);
const url = `http://localhost:${server.address().port}/`;

const tmpVideos = path.join(out, ".hero-raw");
rmSync(tmpVideos, { recursive: true, force: true });
mkdirSync(tmpVideos, { recursive: true });

const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  viewport: { width: W, height: H },
  colorScheme: "dark",
  recordVideo: { dir: tmpVideos, size: { width: W, height: H } },
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
const extensionId = new URL(worker.url()).host;
const control = context.pages()[0] ?? (await context.newPage());
await control.goto(`chrome-extension://${extensionId}/popup.html`);
const setSettings = (patch) =>
  control.evaluate(async (patch) => {
    const { settings } = await chrome.storage.local.get("settings");
    await chrome.storage.local.set({ settings: { ...settings, ...patch } });
  }, patch);
const status = () => control.evaluate(() => chrome.runtime.sendMessage({ target: "offscreen", type: "status" }));

// Warm the model on the real page, then reload it clean with scanning off.
await setSettings({ enabled: true, action: "highlight", threshold: 0.5 });
const page = await context.newPage();
const pageOpened = Date.now();
await page.goto(url);
for (let i = 0; i < 240 && (await status())?.state !== "ready"; i++) await sleep(1000);
await setSettings({ enabled: false });
await page.goto(url);
await page.bringToFront();

// Decoration layer, inside a shadow root: the content script's queries and
// textContent don't reach into shadow DOM, so the extension never scores it.
// (Page-level CSS for the pop and collapse animations still applies.)
await page.addStyleTag({
  content: `
  body { zoom: 0.9; }
  .ad-spotter-flag { animation: pop .45s cubic-bezier(.2,1.4,.4,1) both; }
  @keyframes pop { from { outline-color: transparent; background-color: transparent; transform: scale(.985); } }
  /* Collapse instead of vanishing, for the video only. */
  .ad-spotter-hidden { display: block !important; overflow: hidden !important; animation: collapse .7s ease forwards; }
  @keyframes collapse { 0% { max-height: 400px; opacity: 1; } 35% { opacity: 0; } 100% { max-height: 0; opacity: 0; margin: 0; padding: 0; border-width: 0; } }
  `,
});
await page.evaluate((icon) => {
  const host = document.createElement("div");
  host.id = "hero-host";
  const shadow = host.attachShadow({ mode: "open" });
  shadow.innerHTML = `
  <style>
  .chip { position: fixed; top: 22px; left: 26px; z-index: 2147483647; display: flex; align-items: center; gap: 10px;
    padding: 9px 16px 9px 10px; border-radius: 999px; background: rgba(20,18,30,.82); backdrop-filter: blur(10px);
    border: 1px solid rgba(143,118,255,.45); color: #fff; font: 600 15px/1 system-ui, -apple-system, sans-serif;
    box-shadow: 0 8px 30px rgba(109,74,255,.35); }
  .chip img { width: 26px; height: 26px; border-radius: 7px; }
  .chip span { color: #b9a9ff; font-weight: 500; }
  .beam { position: fixed; left: 0; right: 0; height: 140px; z-index: 2147483646; pointer-events: none; top: -160px;
    background: linear-gradient(180deg, rgba(143,118,255,0) 0%, rgba(143,118,255,.16) 70%, rgba(190,175,255,.9) 98%, rgba(255,255,255,.95) 100%);
    box-shadow: 0 16px 40px rgba(143,118,255,.55); }
  .beam.run { animation: beam 1.9s cubic-bezier(.45,.05,.35,1) forwards; }
  @keyframes beam { to { top: calc(100vh + 20px); } }
  .caption { position: fixed; left: 50%; bottom: 34px; transform: translate(-50%, 16px); z-index: 2147483647; opacity: 0;
    padding: 14px 24px; border-radius: 16px; background: rgba(16,14,24,.88); backdrop-filter: blur(12px);
    border: 1px solid rgba(143,118,255,.4); color: #fff; font: 650 26px/1.2 system-ui, -apple-system, sans-serif; white-space: nowrap;
    box-shadow: 0 12px 40px rgba(0,0,0,.45); transition: opacity .35s ease, transform .35s ease; }
  .caption.show { opacity: 1; transform: translate(-50%, 0); }
  .caption b { color: #b9a9ff; }
  .fade { position: fixed; inset: 0; background: #141417; z-index: 2147483647; opacity: 0; pointer-events: none; transition: opacity .5s ease; }
  .fade.on { opacity: 1; }
  </style>
  <div class="chip"><img src="${icon}"> Ad Spotter <span>· GLiNER2.5-Decide · WebGPU</span></div>
  <div class="beam"></div><div class="caption"></div><div class="fade"></div>`;
  document.body.append(host);
  window.scrollTo(0, 170);
}, `data:image/png;base64,${readFileSync(path.join(root, "public/icons/icon-128.png")).toString("base64")}`);
const inHost = (selector, fn, arg) =>
  page.evaluate(([selector, fnSource, arg]) => {
    const el = document.getElementById("hero-host").shadowRoot.querySelector(selector);
    return new Function("el", "arg", fnSource)(el, arg);
  }, [selector, fn, arg]);
const caption = (html) =>
  inHost(".caption", 'if (!arg) { el.classList.remove("show"); return; } el.innerHTML = arg; el.classList.add("show");', html);

await sleep(600);
const clipStart = Date.now();

// 1. Calm page.
await sleep(1100);
// 2. Beam sweeps while the extension scans for real.
await inHost(".beam", 'el.classList.add("run");');
await setSettings({ enabled: true });
await sleep(2300);
// 3. Result.
const flagged = await page.evaluate(() => document.querySelectorAll("[data-ad-spotter-label]").length);
await caption(`<b>${flagged} ads</b> found · ~100 ms each · <b>0 bytes</b> sent`);
await sleep(2200);
// 4. Remove mode: ads collapse.
await caption("");
await setSettings({ action: "remove" });
await sleep(1500);
// 5. Clean page.
await caption("Runs in your browser. <b>Nothing leaves the tab.</b>");
await sleep(2200);
await inHost(".fade", 'el.classList.add("on");');
await sleep(600);
const clipEnd = Date.now();

const video = page.video();
await page.close();
const rawPath = await video.path();
await setSettings({ enabled: true, action: "highlight" });
await context.close();
server.close();

const final = path.join(out, "hero.webm");
renameSync(rawPath, final);
for (const f of readdirSync(tmpVideos)) rmSync(path.join(tmpVideos, f));
rmSync(tmpVideos, { recursive: true, force: true });
const timing = { startSec: (clipStart - pageOpened) / 1000, durationSec: (clipEnd - clipStart) / 1000, flagged };
writeFileSync(path.join(out, "hero.timing.json"), JSON.stringify(timing, null, 2));
console.log(JSON.stringify(timing));
