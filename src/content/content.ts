// Scans the page for candidate blocks, asks the model about them through the
// service worker, and highlights or hides the ones it calls ads.
import type { Block, ClassifyResponse, ToBackground } from "../shared/messages";
import { isActiveOn, loadSettings, normalizeSettings, type Settings } from "../shared/settings";
import { findCandidates } from "./candidates";
import { adScore, applyScore, clearScore, hasDisclosure } from "./decision";

const BATCH = 6;
const RESCAN_DELAY_MS = 1000;
const LOADING_RETRY_MS = 3000;
const MAX_FAILURES = 5;

let settings: Settings;
let active = false;
let nextId = 0;
let failures = 0;
let running = false;
let rescanTimer: number | undefined;

const seen = new WeakSet<Element>();
const queue: { element: Element; block: Block; marked: boolean }[] = [];
const scored = new Map<string, { element: Element; p: number }>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const send = <T>(message: ToBackground) => chrome.runtime.sendMessage(message) as Promise<T>;

function isVisible(element: Element): boolean {
  return element.getClientRects().length > 0;
}

function scan(): void {
  if (!active || !document.body) return;
  for (const { element, text, hinted } of findCandidates(document.body, { seen, isVisible })) {
    seen.add(element);
    const id = `g${nextId++}`;
    // The page marks it as an ad itself: a disclosure label or ad-slot markup.
    queue.push({ element, block: { id, text }, marked: hinted || hasDisclosure(text) });
  }
  void drain();
}

async function report(error?: string): Promise<void> {
  let flagged = 0;
  for (const { element } of scored.values()) {
    if (element.hasAttribute("data-ad-spotter-label")) flagged++;
  }
  await send({ type: "report", scanned: scored.size, flagged, error }).catch(() => {});
}

async function drain(): Promise<void> {
  if (running) return;
  running = true;
  try {
    while (active && queue.length > 0) {
      const batch = queue.slice(0, BATCH);
      let response: ClassifyResponse;
      try {
        response = await send<ClassifyResponse>({ type: "classify", blocks: batch.map((item) => item.block) });
      } catch (error) {
        response = { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
      if (response.ok) {
        queue.splice(0, batch.length);
        failures = 0;
        for (const { id, p } of response.scores) {
          const item = batch.find((entry) => entry.block.id === id);
          if (!item || !item.element.isConnected) continue;
          const score = adScore(p, item.marked);
          scored.set(id, { element: item.element, p: score });
          applyScore(item.element, score, settings.threshold, settings.action);
        }
        await report();
      } else if (response.loading) {
        // First run downloads the model; keep the queue and ask again.
        await sleep(LOADING_RETRY_MS);
      } else {
        failures++;
        await report(response.error);
        if (failures >= MAX_FAILURES) {
          console.warn("[ad-spotter] giving up on this page:", response.error);
          queue.length = 0;
          break;
        }
        await sleep(1000 * 2 ** failures);
      }
    }
  } finally {
    running = false;
  }
}

function reapplyAll(): void {
  for (const { element, p } of scored.values()) {
    if (active) applyScore(element, p, settings.threshold, settings.action);
    else clearScore(element);
  }
  void report();
}

const observer = new MutationObserver(() => {
  window.clearTimeout(rescanTimer);
  rescanTimer = window.setTimeout(scan, RESCAN_DELAY_MS);
});

function setActive(next: boolean): void {
  active = next;
  if (active) {
    observer.observe(document.body, { childList: true, subtree: true });
    scan();
  } else {
    observer.disconnect();
    queue.length = 0;
  }
  reapplyAll();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.settings) return;
  settings = normalizeSettings(changes.settings.newValue);
  const nextActive = isActiveOn(settings, location.hostname);
  if (nextActive !== active) setActive(nextActive);
  else reapplyAll();
});

(async () => {
  settings = await loadSettings();
  if (isActiveOn(settings, location.hostname)) setActive(true);
})();
