// Score candidate adScore policies on labelled blocks, using the extension's
// question. Usage: node eval/policies.mjs [blocks.json]
import { readFileSync } from "node:fs";
import { OpenJev } from "open-jev";
import { VARIANTS } from "./variants.mjs";

const blocks = JSON.parse(readFileSync(process.argv[2] ?? new URL("./blocks.json", import.meta.url), "utf8"));
// Same rule as src/content/decision.ts hasDisclosure, plus the "[ad slot: …]"
// note the content script adds for ad markup.
const DISCLOSURE =
  /(?:^|[^\p{L}#])(?:Sponsored|SPONSORED|Promoted|PROMOTED|Advertisement|ADVERTISEMENT|Paid partnership|PAID PARTNERSHIP|Paid post|#ad|Anzeige|ANZEIGE)(?=$|[^\p{L}])|^(?:Ad|AD)(?=$|[^\p{L}])/u;
const isMarked = (text) => DISCLOSURE.test(text) || text.includes("[ad slot:");

const POLICIES = {
  "model only": (p) => p,
  "boost marked": (p, m) => (m ? Math.max(p, 0.6) : p),
  "damp unmarked": (p, m) => (m ? p : p * 0.6),
  "both": (p, m) => (m ? 1 - (1 - p) * 0.5 : p * 0.6),
};

const q = VARIANTS.threeWayByline;
const jev = await OpenJev.load({ model: "gliner2-decide", device: "cpu", dtype: "fp16" });
const rows = [];
for (const b of blocks) {
  const { q: a } = await jev.decide(b.text, { q: q.question });
  rows.push({ ad: b.ad, p: q.adProbability(a), marked: isMarked(b.text) });
}
await jev.dispose();

const ads = rows.filter((r) => r.ad);
console.log(`${rows.length} blocks, ${ads.length} ads, ${ads.filter((r) => r.marked).length} of the ads are marked, ${rows.filter((r) => !r.ad && r.marked).length} non-ads are marked\n`);
console.log("policy            caught ads   false positives");
for (const [name, f] of Object.entries(POLICIES)) {
  const caught = ads.filter((r) => f(r.p, r.marked) >= 0.5).length;
  const fp = rows.filter((r) => !r.ad && f(r.p, r.marked) >= 0.5).length;
  console.log(`${name.padEnd(18)}${`${caught}/${ads.length}`.padEnd(13)}${fp}/${rows.length - ads.length}`);
}
