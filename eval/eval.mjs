// Compare question wordings on eval/blocks.json in Node (CPU).
// Usage: node eval/eval.mjs [fp16|fp32|q4f16] [blocks.json]
import { readFileSync } from "node:fs";
import { OpenJev } from "open-jev";
import { VARIANTS } from "./variants.mjs";

const dtype = process.argv[2] ?? "fp16";
const blocks = JSON.parse(readFileSync(process.argv[3] ?? new URL("./blocks.json", import.meta.url), "utf8"));

const jev = await OpenJev.load({ model: "gliner2-decide", device: "cpu", dtype });
console.log(`loaded ${jev.runtime.model} ${jev.runtime.dtype}, ${blocks.length} blocks\n`);

function auc(scored) {
  const pos = scored.filter((s) => s.ad).map((s) => s.p);
  const neg = scored.filter((s) => !s.ad).map((s) => s.p);
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

for (const [name, variant] of Object.entries(VARIANTS)) {
  const scored = [];
  for (const block of blocks) {
    const answer = await jev.decide(block.text, { q: variant.question });
    scored.push({ ...block, p: variant.adProbability(answer.q) });
  }
  const errors = scored.filter((s) => s.p >= 0.5 !== s.ad);
  console.log(
    `${name.padEnd(12)} acc@0.5 ${((1 - errors.length / scored.length) * 100).toFixed(1)}%  AUC ${auc(scored).toFixed(3)}`,
  );
  for (const e of errors) console.log(`   ✗ ${e.ad ? "ad " : "not"} p=${e.p.toFixed(2)}  ${e.kind}`);
}
await jev.dispose();
