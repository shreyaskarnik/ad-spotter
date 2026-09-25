import type { WeightVariant } from "./settings";

export type Block = { id: string; text: string };
export type BlockScore = { id: string; p: number };

export type ModelStatus =
  | { state: "idle" }
  | { state: "loading"; progress: number }
  | { state: "ready"; device: string; dtype: string; classified: number; avgMs: number }
  | { state: "error"; message: string };

export type TabCounters = { scanned: number; flagged: number; errors: number; lastError?: string };

/** Result of a classify request. `loading` means ask again later. */
export type ClassifyResponse =
  | { ok: true; scores: BlockScore[]; ms: number }
  | { ok: false; loading: true; status: ModelStatus }
  | { ok: false; loading?: false; error: string };

/** Messages handled by the service worker. */
export type ToBackground =
  | { type: "classify"; blocks: Block[] }
  | { type: "report"; scanned: number; flagged: number; error?: string }
  | { type: "getState"; tabId: number }
  | { type: "loadModel" }
  | { type: "reloadModel" }
  | { type: "modelStatus"; status: ModelStatus };

/** Messages handled by the offscreen document (always carry `target`). */
export type ToOffscreen =
  | { target: "offscreen"; type: "classify"; blocks: Block[]; dtype: WeightVariant }
  | { target: "offscreen"; type: "load"; dtype: WeightVariant }
  | { target: "offscreen"; type: "reload"; dtype: WeightVariant }
  | { target: "offscreen"; type: "status" }
  | { target: "offscreen"; type: "recent" };

export type StateResponse = {
  status: ModelStatus;
  counters: TabCounters;
};
