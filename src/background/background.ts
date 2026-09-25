// Routes messages between content scripts, the popup and the offscreen model
// host, and keeps per-tab counters for the badge and popup.
import type {
  ClassifyResponse,
  ModelStatus,
  StateResponse,
  TabCounters,
  ToBackground,
  ToOffscreen,
} from "../shared/messages";
import { loadSettings } from "../shared/settings";

const OFFSCREEN_URL = "offscreen.html";
const EMPTY: TabCounters = { scanned: 0, flagged: 0, errors: 0 };

let creating: Promise<void> | null = null;
let lastStatus: ModelStatus = { state: "idle" };

async function hasOffscreen(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
  });
  return contexts.length > 0;
}

async function ensureOffscreen(): Promise<void> {
  if (await hasOffscreen()) return;
  creating ??= chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.WORKERS],
      justification: "Runs the GLiNER2.5-Decide model on WebGPU to classify page blocks locally.",
    })
    .finally(() => {
      creating = null;
    });
  await creating;
}

async function toOffscreen<T>(message: ToOffscreen): Promise<T> {
  await ensureOffscreen();
  return chrome.runtime.sendMessage(message);
}

// Counters live in session storage so they survive the worker restarting.
async function getCounters(tabId: number): Promise<TabCounters> {
  const key = `tab:${tabId}`;
  const stored = await chrome.storage.session.get(key);
  return { ...EMPTY, ...(stored[key] as TabCounters | undefined) };
}

async function setCounters(tabId: number, counters: TabCounters): Promise<void> {
  await chrome.storage.session.set({ [`tab:${tabId}`]: counters });
  await chrome.action.setBadgeText({ tabId, text: counters.flagged ? String(counters.flagged) : "" });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: counters.errors ? "#b42318" : "#5b5bd6" });
}

async function currentStatus(): Promise<ModelStatus> {
  if (!(await hasOffscreen())) return lastStatus.state === "error" ? lastStatus : { state: "idle" };
  try {
    lastStatus = await chrome.runtime.sendMessage({ target: "offscreen", type: "status" } satisfies ToOffscreen);
  } catch {
    // Offscreen document is starting up; keep the last known status.
  }
  return lastStatus;
}

async function handle(message: ToBackground, sender: chrome.runtime.MessageSender): Promise<unknown> {
  switch (message.type) {
    case "classify": {
      const { dtype } = await loadSettings();
      try {
        return await toOffscreen<ClassifyResponse>({ target: "offscreen", type: "classify", blocks: message.blocks, dtype });
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) } satisfies ClassifyResponse;
      }
    }
    case "report": {
      const tabId = sender.tab?.id;
      if (tabId === undefined) return null;
      // The page sends running totals, so these replace rather than add.
      const counters = await getCounters(tabId);
      counters.scanned = message.scanned;
      counters.flagged = message.flagged;
      if (message.error) {
        counters.errors += 1;
        counters.lastError = message.error;
      }
      await setCounters(tabId, counters);
      return null;
    }
    case "getState":
      return { status: await currentStatus(), counters: await getCounters(message.tabId) } satisfies StateResponse;
    case "loadModel":
    case "reloadModel": {
      const { dtype } = await loadSettings();
      lastStatus = await toOffscreen<ModelStatus>({
        target: "offscreen",
        type: message.type === "loadModel" ? "load" : "reload",
        dtype,
      });
      return lastStatus;
    }
    case "modelStatus":
      lastStatus = message.status;
      return null;
  }
}

chrome.runtime.onMessage.addListener((message: ToBackground & { target?: string }, sender, sendResponse) => {
  if (message?.target === "offscreen") return false;
  handle(message, sender).then(sendResponse, (error) =>
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
  );
  return true;
});

// A new page in the tab starts its counters from zero.
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status === "loading" && change.url) setCounters(tabId, { ...EMPTY }).catch(() => {});
});
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(`tab:${tabId}`).catch(() => {});
});
