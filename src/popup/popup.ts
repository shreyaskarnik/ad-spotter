import type { ModelStatus, StateResponse, ToBackground } from "../shared/messages";
import { loadSettings, saveSettings, type AdAction, type Settings, type WeightVariant } from "../shared/settings";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const send = <T>(message: ToBackground) => chrome.runtime.sendMessage(message) as Promise<T>;

let tabId: number | undefined;
let hostname = "";
let settings: Settings;

function renderSettings(): void {
  $<HTMLInputElement>("enabled").checked = settings.enabled;
  const site = $<HTMLInputElement>("site");
  site.checked = !settings.disabledHosts.includes(hostname);
  site.disabled = !hostname || !settings.enabled;
  $<HTMLInputElement>("threshold").value = String(settings.threshold);
  $<HTMLOutputElement>("threshold-value").textContent = settings.threshold.toFixed(2);
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-action]")) {
    button.setAttribute("aria-checked", String(button.dataset.action === settings.action));
  }
  $<HTMLSelectElement>("dtype").value = settings.dtype;
}

function renderStatus(status: ModelStatus): void {
  const dot = $("health-dot");
  const title = $("health-title");
  const detail = $("health-detail");
  const action = $<HTMLButtonElement>("health-action");
  const progress = $("progress");
  dot.className = "dot";
  action.hidden = true;
  progress.hidden = true;

  switch (status.state) {
    case "idle":
      title.textContent = "Model not loaded";
      detail.textContent = "Loads on the first page you open (0.5–0.9 GB, once).";
      action.hidden = false;
      action.textContent = "Load";
      break;
    case "loading":
      dot.classList.add("warn");
      title.textContent = `Loading model · ${Math.round(status.progress * 100)}%`;
      detail.textContent = "Downloaded once, then cached in the browser.";
      progress.hidden = false;
      $("progress-bar").style.width = `${Math.round(status.progress * 100)}%`;
      break;
    case "ready":
      dot.classList.add("ok");
      title.textContent = `Ready · ${status.device} · ${status.dtype}`;
      detail.textContent = status.classified
        ? `${status.classified} blocks classified · ${status.avgMs} ms per block`
        : "Waiting for a page to scan.";
      break;
    case "error":
      dot.classList.add("bad");
      title.textContent = "Model failed to load";
      detail.textContent = status.message;
      action.hidden = false;
      action.textContent = "Retry";
      break;
  }
}

async function refresh(): Promise<void> {
  if (tabId === undefined) return;
  try {
    const state = await send<StateResponse>({ type: "getState", tabId });
    renderStatus(state.status);
    $("scanned").textContent = String(state.counters.scanned);
    $("flagged").textContent = String(state.counters.flagged);
    $("errors").textContent = String(state.counters.errors);
    const lastError = $("last-error");
    lastError.hidden = !state.counters.lastError;
    lastError.textContent = state.counters.lastError ? `Last error: ${state.counters.lastError}` : "";
  } catch (error) {
    renderStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
  }
}

async function update(patch: Partial<Settings>): Promise<void> {
  settings = await saveSettings(patch);
  renderSettings();
}

async function init(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id;
  try {
    hostname = tab?.url ? new URL(tab.url).hostname : "";
  } catch {
    hostname = "";
  }
  settings = await loadSettings();
  renderSettings();

  $<HTMLInputElement>("enabled").addEventListener("change", (event) =>
    update({ enabled: (event.target as HTMLInputElement).checked }),
  );
  $<HTMLInputElement>("site").addEventListener("change", (event) => {
    const on = (event.target as HTMLInputElement).checked;
    const others = settings.disabledHosts.filter((host) => host !== hostname);
    update({ disabledHosts: on ? others : [...others, hostname] });
  });
  $<HTMLInputElement>("threshold").addEventListener("input", (event) =>
    update({ threshold: Number((event.target as HTMLInputElement).value) }),
  );
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-action]")) {
    button.addEventListener("click", () => update({ action: button.dataset.action as AdAction }));
  }
  $<HTMLSelectElement>("dtype").addEventListener("change", async (event) => {
    await update({ dtype: (event.target as HTMLSelectElement).value as WeightVariant });
    await send({ type: "reloadModel" });
    void refresh();
  });
  $<HTMLButtonElement>("health-action").addEventListener("click", async () => {
    await send({ type: "reloadModel" });
    void refresh();
  });

  // The offscreen host broadcasts status while loading.
  chrome.runtime.onMessage.addListener((message: { type?: string; status?: ModelStatus; target?: string }) => {
    if (message?.type === "modelStatus" && message.status) renderStatus(message.status);
  });

  await refresh();
  setInterval(refresh, 1000);
}

void init();
