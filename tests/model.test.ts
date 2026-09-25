// Runs the real model on eval/blocks.json (CPU, ~1 min after a 0.9 GB download).
// Opt in with RUN_MODEL=1 pnpm test.
import { readFileSync } from "node:fs";
import { OpenJev } from "open-jev";
import { describe, expect, it } from "vitest";
import { AD, AD_QUESTION } from "../src/shared/question";

type Labelled = { ad: boolean; kind: string; text: string };

describe.skipIf(!process.env.RUN_MODEL)("GLiNER2.5-Decide on labelled blocks", () => {
  it("separates ads from content", async () => {
    const blocks: Labelled[] = JSON.parse(readFileSync(new URL("../eval/blocks.json", import.meta.url), "utf8"));
    const jev = await OpenJev.load({ model: "gliner2-decide", device: "cpu", dtype: "fp16" });
    const scored = [];
    for (const block of blocks) {
      const { q } = await jev.decide(block.text, { q: AD_QUESTION });
      scored.push({ ...block, p: q.probabilities[AD] ?? 0 });
    }
    await jev.dispose();

    const accuracy = scored.filter((s) => s.p >= 0.5 === s.ad).length / scored.length;
    const ads = scored.filter((s) => s.ad).map((s) => s.p);
    const content = scored.filter((s) => !s.ad).map((s) => s.p);
    let wins = 0;
    for (const a of ads) for (const c of content) wins += a > c ? 1 : 0;
    expect(accuracy).toBeGreaterThanOrEqual(0.95);
    expect(wins / (ads.length * content.length)).toBeGreaterThanOrEqual(0.98);
  }, 600_000);
});
