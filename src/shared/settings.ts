export type AdAction = "highlight" | "remove";
export type WeightVariant = "auto" | "fp16" | "q4f16" | "q4";

export type Settings = {
  enabled: boolean;
  /** p(ad) at or above this is treated as an ad. */
  threshold: number;
  action: AdAction;
  dtype: WeightVariant;
  /** Hostnames where scanning is switched off. */
  disabledHosts: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  threshold: 0.5,
  action: "highlight",
  dtype: "auto",
  disabledHosts: [],
};

const ACTIONS: readonly AdAction[] = ["highlight", "remove"];
const VARIANTS: readonly WeightVariant[] = ["auto", "fp16", "q4f16", "q4"];

/** Merge whatever is in storage over the defaults, dropping invalid values. */
export function normalizeSettings(raw: unknown): Settings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const threshold = typeof value.threshold === "number" && Number.isFinite(value.threshold)
    ? Math.min(0.99, Math.max(0.01, value.threshold))
    : DEFAULT_SETTINGS.threshold;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_SETTINGS.enabled,
    threshold,
    action: ACTIONS.includes(value.action as AdAction) ? (value.action as AdAction) : DEFAULT_SETTINGS.action,
    dtype: VARIANTS.includes(value.dtype as WeightVariant) ? (value.dtype as WeightVariant) : DEFAULT_SETTINGS.dtype,
    disabledHosts: Array.isArray(value.disabledHosts)
      ? value.disabledHosts.filter((host): host is string => typeof host === "string")
      : [],
  };
}

export function isActiveOn(settings: Settings, hostname: string): boolean {
  return settings.enabled && !settings.disabledHosts.includes(hostname);
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get("settings");
  return normalizeSettings(stored.settings);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await loadSettings()), ...patch });
  await chrome.storage.local.set({ settings: next });
  return next;
}
