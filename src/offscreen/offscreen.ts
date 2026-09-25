// Holds the GLiNER2.5-Decide session. Lives in an offscreen document so the
// model survives the service worker going idle.
import { env } from "@huggingface/transformers";
import { OpenJev } from "open-jev";
import type { ClassifyResponse, ModelStatus, ToOffscreen } from "../shared/messages";
import { AD, AD_QUESTION, MAX_BLOCK_CHARS } from "../shared/question";
import type { WeightVariant } from "../shared/settings";

// MV3 forbids remote code and blob: imports, so ONNX Runtime loads from the
// copy bundled in ort/ instead of the CDN.
env.useWasmCache = false;
env.backends.onnx.wasm!.wasmPaths = {
  mjs: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.asyncify.mjs"),
  wasm: chrome.runtime.getURL("ort/ort-wasm-simd-threaded.asyncify.wasm"),
};

const MODEL = "gliner2-decide";

let jev: OpenJev | null = null;
let loading: Promise<OpenJev> | null = null;
let loadedDtype: WeightVariant | null = null;
let status: ModelStatus = { state: "idle" };
let classified = 0;
/** Last blocks scored, for debugging from the service worker console. */
const recent: { text: string; p: number }[] = [];
let totalMs = 0;

function setStatus(next: ModelStatus): void {
  status = next;
  chrome.runtime.sendMessage({ type: "modelStatus", status }).catch(() => {});
}

function readyStatus(instance: OpenJev): ModelStatus {
  return {
    state: "ready",
    device: instance.runtime.device,
    dtype: instance.runtime.dtype,
    classified,
    avgMs: classified ? Math.round(totalMs / classified) : 0,
  };
}

function ensureLoaded(dtype: WeightVariant): Promise<OpenJev> {
  if (jev && loadedDtype === dtype) return Promise.resolve(jev);
  if (loading) return loading;
  setStatus({ state: "loading", progress: 0 });
  loading = (async () => {
    try {
      if (jev) {
        await jev.dispose();
        jev = null;
      }
      const instance = await OpenJev.load({
        model: MODEL,
        dtype,
        onProgress: ({ progress }) => setStatus({ state: "loading", progress }),
      });
      // First call compiles the WebGPU shaders; do it now, not on a real page.
      await instance.decide("Warm-up.", { q: AD_QUESTION });
      jev = instance;
      loadedDtype = dtype;
      setStatus(readyStatus(instance));
      return instance;
    } catch (error) {
      setStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

async function classify(message: Extract<ToOffscreen, { type: "classify" }>): Promise<ClassifyResponse> {
  if (!jev || loadedDtype !== message.dtype) {
    ensureLoaded(message.dtype).catch(() => {});
    return { ok: false, loading: true, status };
  }
  const started = performance.now();
  const scores = [];
  for (const block of message.blocks) {
    const answer = await jev.decide(block.text.slice(0, MAX_BLOCK_CHARS), { q: AD_QUESTION });
    const p = answer.q.probabilities[AD] ?? 0;
    scores.push({ id: block.id, p });
    recent.push({ text: block.text, p });
    if (recent.length > 200) recent.shift();
  }
  const ms = performance.now() - started;
  classified += message.blocks.length;
  totalMs += ms;
  setStatus(readyStatus(jev));
  return { ok: true, scores, ms };
}

chrome.runtime.onMessage.addListener((message: ToOffscreen, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return false;
  const reply = (work: Promise<unknown>) => {
    work.then(sendResponse, (error) =>
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
    return true;
  };
  switch (message.type) {
    case "classify":
      return reply(classify(message));
    case "load":
      ensureLoaded(message.dtype).catch(() => {});
      sendResponse(status);
      return false;
    case "reload":
      loadedDtype = null;
      ensureLoaded(message.dtype).catch(() => {});
      sendResponse(status);
      return false;
    case "status":
      sendResponse(status);
      return false;
    case "recent":
      sendResponse(recent);
      return false;
  }
  return false;
});
