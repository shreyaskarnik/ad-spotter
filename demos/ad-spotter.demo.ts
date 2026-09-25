import { createReadStream } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { showOverlay, test, withOverlay } from "@argo-video/cli";
import { chromium, type BrowserContext, type Page } from "playwright";

// argo runs from the project root.
const root = process.cwd();
const dist = path.join(root, "dist");
// Same profile as scripts/e2e.mjs, so the model is already cached.
const profile = path.join(root, ".e2e-profile");

type Settings = { enabled?: boolean; action?: "highlight" | "remove"; threshold?: number };

test("ad-spotter", async ({ narration }) => {
  test.setTimeout(300_000);

  const server = createServer((_req, res) => {
    res.setHeader("content-type", "text/html");
    createReadStream(path.join(root, "demos/assets/news.html")).pipe(res);
  }).listen(0);
  const url = `http://localhost:${(server.address() as { port: number }).port}/`;

  const context: BrowserContext = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  try {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const extensionId = new URL(worker.url()).host;

    // A background extension tab to change settings from, so nothing on the
    // recorded page is clicked by a script.
    const control = context.pages()[0] ?? (await context.newPage());
    await control.goto(`chrome-extension://${extensionId}/popup.html`);
    const setSettings = (patch: Settings) =>
      control.evaluate(async (patch) => {
        const { settings } = await chrome.storage.local.get("settings");
        await chrome.storage.local.set({ settings: { ...settings, ...patch } });
      }, patch);
    const modelStatus = () =>
      control.evaluate(() => chrome.runtime.sendMessage({ target: "offscreen", type: "status" }));

    // Load the model before recording, with scanning off.
    await setSettings({ enabled: true, action: "highlight", threshold: 0.5 });
    const page: Page = await context.newPage();
    await page.goto(url);
    for (let i = 0; i < 240 && (await modelStatus())?.state !== "ready"; i++) await page.waitForTimeout(1000);
    await setSettings({ enabled: false });
    await page.goto("about:blank");
    await page.goto(url);
    await page.bringToFront();
    const tabId = await control.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return tabs[0]?.id;
    });
    await page.waitForTimeout(800);

    await narration.startRecording(page);

    narration.mark("intro");
    await showOverlay(page, "intro", {
      type: "headline-card",
      kicker: "Chrome extension",
      title: "Ad Spotter",
      body: "Finds ads by reading the page",
      placement: "top-right",
      motion: "slide-in",
    }, narration.durationFor("intro"));

    narration.mark("model");
    await withOverlay(page, "model", {
      type: "lower-third",
      text: "GLiNER2.5-Decide · WebGPU · on-device",
      placement: "bottom-center",
      motion: "fade-in",
    }, async () => {
      await page.mouse.wheel(0, 260);
      await page.waitForTimeout(narration.durationFor("model"));
    });

    narration.mark("scan");
    await setSettings({ enabled: true });
    await page.waitForTimeout(2500);
    await page.mouse.wheel(0, 320);
    await withOverlay(page, "scan", {
      type: "callout",
      text: "Ad, editorial, or page furniture?",
      placement: "top-right",
      motion: "fade-in",
    }, async () => {
      await page.waitForTimeout(narration.durationFor("scan"));
    });

    narration.mark("late");
    await page.evaluate(() => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML =
        '<div class="muted">Promoted</div><h3>Acme Cloud: cut your AWS bill by 40% in one afternoon</h3>Start your free trial today. No credit card required.';
      document.getElementById("comments")?.before(card);
    });
    await page.mouse.wheel(0, 380);
    await page.waitForTimeout(narration.durationFor("late"));

    narration.mark("remove");
    await withOverlay(page, "remove", {
      type: "callout",
      text: "Remove mode",
      placement: "top-right",
      motion: "fade-in",
    }, async () => {
      await page.waitForTimeout(1200);
      await setSettings({ action: "remove" });
      await page.waitForTimeout(1500);
      await page.mouse.wheel(0, -500);
      await page.waitForTimeout(narration.durationFor("remove"));
    });

    narration.mark("popup");
    await page.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);
    await page.evaluate(() => {
      document.documentElement.style.background = "var(--bg)";
      document.body.style.zoom = "2";
      document.body.style.margin = "40px auto";
      document.body.style.borderRadius = "16px";
      document.body.style.boxShadow = "0 12px 40px rgba(0,0,0,.18)";
    });
    await page.waitForTimeout(narration.durationFor("popup"));

    narration.mark("closing");
    await showOverlay(page, "closing", {
      type: "lower-third",
      text: "github.com/shreyaskarnik/ad-spotter",
      placement: "bottom-center",
      motion: "fade-in",
    }, narration.durationFor("closing", { leadOutMs: 900 }));

    // Stop the screencast while the page is alive, then leave settings as found.
    await narration._closeRecording();
    await setSettings({ enabled: true, action: "highlight" });
  } finally {
    await context.close();
    server.close();
  }
});
