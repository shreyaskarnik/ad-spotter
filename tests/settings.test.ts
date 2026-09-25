import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, isActiveOn, normalizeSettings } from "../src/shared/settings";

describe("normalizeSettings", () => {
  it("falls back to defaults for missing or broken storage", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings("nonsense")).toEqual(DEFAULT_SETTINGS);
  });

  it("clamps the threshold and drops invalid values", () => {
    const s = normalizeSettings({ threshold: 7, action: "explode", dtype: "int2", disabledHosts: ["a.com", 3] });
    expect(s.threshold).toBe(0.99);
    expect(s.action).toBe("highlight");
    expect(s.dtype).toBe("auto");
    expect(s.disabledHosts).toEqual(["a.com"]);
  });
});

describe("isActiveOn", () => {
  it("respects the global switch and the per-site list", () => {
    const s = normalizeSettings({ disabledHosts: ["news.example"] });
    expect(isActiveOn(s, "shop.example")).toBe(true);
    expect(isActiveOn(s, "news.example")).toBe(false);
    expect(isActiveOn({ ...s, enabled: false }, "shop.example")).toBe(false);
  });
});
