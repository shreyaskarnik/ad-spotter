// Bundles the extension into dist/. Pass --watch to rebuild on change.
import * as esbuild from "esbuild";
import { cpSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

// open-jev is linked from a sibling checkout with its own node_modules; point
// every import of transformers at ours so the env settings apply to the copy
// that actually runs.
const transformersDir = realpathSync(join(root, "node_modules/@huggingface/transformers"));
const transformersWeb = join(transformersDir, "dist/transformers.web.js");

// ONNX Runtime's wasm must ship inside the extension (MV3 blocks remote code).
// pnpm keeps it next to transformers in the virtual store.
const ortDist = join(transformersDir, "../../onnxruntime-web/dist");
if (!existsSync(ortDist)) throw new Error(`onnxruntime-web not found at ${ortDist}`);

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, "ort"), { recursive: true });
cpSync(join(root, "public"), dist, { recursive: true });
for (const file of readdirSync(ortDist)) {
  if (/^ort-wasm-simd-threaded\.asyncify\.(mjs|wasm)$/.test(file)) cpSync(join(ortDist, file), join(dist, "ort", file));
}

const common = {
  bundle: true,
  target: "chrome116",
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  logLevel: "info",
  alias: { "@huggingface/transformers": transformersWeb },
};

const builds = [
  { entryPoints: { content: "src/content/content.ts" }, format: "iife" },
  { entryPoints: { background: "src/background/background.ts" }, format: "esm" },
  { entryPoints: { popup: "src/popup/popup.ts" }, format: "esm" },
  { entryPoints: { offscreen: "src/offscreen/offscreen.ts" }, format: "esm" },
];

for (const options of builds) {
  const config = { ...common, ...options, outdir: dist, absWorkingDir: root };
  if (watch) await (await esbuild.context(config)).watch();
  else await esbuild.build(config);
}
if (!watch) console.log(`built ${dist}`);
