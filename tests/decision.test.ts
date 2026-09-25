// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { FLAG_CLASS, HIDE_CLASS, adScore, applyScore, clearScore, hasDisclosure, isAd, labelFor } from "../src/content/decision";

describe("decision", () => {
  it("treats the threshold as inclusive", () => {
    expect(isAd(0.5, 0.5)).toBe(true);
    expect(isAd(0.49, 0.5)).toBe(false);
  });

  it("labels with a rounded percentage", () => {
    expect(labelFor(0.876)).toBe("Ad 88%");
  });

  it("highlights, hides and clears according to score and action", () => {
    const el = document.createElement("div");
    expect(applyScore(el, 0.9, 0.5, "highlight")).toBe(true);
    expect(el.classList.contains(FLAG_CLASS)).toBe(true);
    expect(el.getAttribute("data-ad-spotter-label")).toBe("Ad 90%");

    applyScore(el, 0.9, 0.5, "remove");
    expect(el.classList.contains(FLAG_CLASS)).toBe(false);
    expect(el.classList.contains(HIDE_CLASS)).toBe(true);

    expect(applyScore(el, 0.9, 0.95, "remove")).toBe(false);
    expect(el.classList.contains(HIDE_CLASS)).toBe(false);
    expect(el.hasAttribute("data-ad-spotter-label")).toBe(false);

    applyScore(el, 0.9, 0.5, "highlight");
    clearScore(el);
    expect(el.className).toBe("");
  });
});

describe("hasDisclosure", () => {
  it("finds standalone disclosure labels, including all-caps ones", () => {
    expect(hasDisclosure("Doctors stunned: this one trick. Health Digest · Sponsored")).toBe(true);
    expect(hasDisclosure("SPONSORED Northwind Mattress: sleep cool")).toBe(true);
    expect(hasDisclosure("Promoted. Acme Cloud: cut your bill")).toBe(true);
    expect(hasDisclosure("Ad · 0:15 Discover Lumen VPN")).toBe(true);
    expect(hasDisclosure("Use code SARAH20 for 20% off. #ad")).toBe(true);
  });

  it("ignores ordinary words and mid-sentence uses", () => {
    expect(hasDisclosure("The marathon, sponsored by the city, drew 20,000 runners.")).toBe(false);
    expect(hasDisclosure("Adobe adds Photoshop tools to Gemini")).toBe(false);
    expect(hasDisclosure("Online advertising revenue grew 12 percent")).toBe(false);
    expect(hasDisclosure("Read the #adventure diaries")).toBe(false);
  });
});

describe("adScore", () => {
  it("stays a probability and never lowers the score of a marked block", () => {
    for (const p of [0, 0.05, 0.36, 0.5, 0.9, 1]) {
      for (const marked of [false, true]) {
        const score = adScore(p, marked);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
      expect(adScore(p, true)).toBeGreaterThanOrEqual(adScore(p, false));
    }
  });

});
