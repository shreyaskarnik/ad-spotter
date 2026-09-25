# GLiNER Ad Spotter

A Chrome extension that finds sponsored content on web pages with [GLiNER2.5-Decide](https://huggingface.co/fastino/GLiNER2.5-Decide) running on your GPU through WebGPU. There is no server and no API key: page text is read, classified and acted on inside the browser.

It asks one question of each block of a page (is this a paid ad, editorial content, or page furniture?) and highlights or removes the blocks the model calls ads.

## Setup

Needs Node 20+, pnpm, and Chrome 116+ with WebGPU (any recent Mac, or Windows/Linux with a supported GPU).

```bash
pnpm install
pnpm build          # writes dist/
```

The `gliner2-decide` model family isn't in an npm release of [open-jev](https://github.com/nico-martin/open-jev) yet ([PR](https://github.com/nico-martin/open-jev/pull/1)), so a build of that branch is vendored in `vendor/open-jev` (MIT, with its license and source commit). It will be swapped for the npm package once released.

Then in Chrome:

1. Open `chrome://extensions` and switch on **Developer mode**.
2. Click **Load unpacked** and choose the `dist/` folder.
3. Open any page. The first page downloads the model (about 0.9 GB for fp16, 0.5 GB for q4f16) from Hugging Face into the extension's cache; after that nothing is downloaded again.

`pnpm watch` rebuilds on change; press the reload icon on the extension card to pick it up.

## Using it

The toolbar popup shows:

- **Model health**: not loaded, loading with progress, ready with device, weights and average time per block, or the load error with a retry button.
- **Counters** for the current tab: blocks scanned, ads found, errors (and the last error). The badge on the toolbar icon shows the ads-found count.
- **Controls**: the global on/off switch, a per-site switch, the threshold (p(ad) at or above it counts as an ad), highlight or remove, and the weight variant.

Highlighted blocks get a dashed violet outline and an "Ad 87%" tag; removed blocks are hidden with `display: none`. Changing the threshold or action re-applies the stored scores immediately, without running the model again.

## How it works

```
content script ──classify──▶ service worker ──▶ offscreen document
 (finds blocks,              (routes, counts,     (GLiNER2.5-Decide on
  applies results)            badge)               WebGPU via open-jev)
```

- **`src/content/candidates.ts`** picks what to classify. Blocks with ad-like ids, classes or a leading "Sponsored" label come first; then the page is split into non-overlapping blocks of 30–1200 characters, walking down from the root and splitting lists (a feed) into their items. A block's text is its visible text plus short notes for what text alone misses: embedded frames (title, id, source, size), ad-slot class names, and image alt text that doesn't repeat the visible text. Display ads are usually text-less iframes, so these notes are what lets a text model see them.
- **`src/content/content.ts`** queues blocks, sends them in batches of 6, and watches the page with a `MutationObserver` for ads injected after load. While the model is still downloading it keeps the queue and asks again every 3 s; after 5 errors in a row it gives up on the page.
- **`src/offscreen/offscreen.ts`** holds the model in an [offscreen document](https://developer.chrome.com/docs/extensions/reference/api/offscreen), which outlives the service worker's idle shutdowns. It warms the WebGPU shaders once after loading.
- **`src/shared/question.ts`** is the question, picked by measurement (see below).

Two things are specific to Manifest V3: ONNX Runtime's wasm is bundled under `dist/ort/` because extensions can't load code from a CDN, and Transformers.js's wasm blob cache is off because extension pages can't import `blob:` URLs.

## Privacy

Page text never leaves the browser. The only network traffic the extension causes is the one-time model download from `huggingface.co`. It asks for no host permissions, only `storage` and `offscreen`.

## Tuning adScore

`adScore(p, marked)` in `src/content/decision.ts` combines the model's p(ad) with whether the page itself marks the block as an ad (a disclosure label like "Sponsored", or ad-slot markup like `div-gpt-ad`). It currently returns `p` unchanged; the choice of how much marking should count is left open because the data points both ways.

`node eval/policies.mjs [blocks.json]` scores a few policies at threshold 0.5. On the hand-written set (`eval/blocks.json`) and on 69 blocks captured from a real news front page:

| policy | hand-written set: ads caught / false positives | news front page: ads caught / false positives |
| --- | --- | --- |
| model only | 17/18 · 0/29 | 5/7 · 9/62 |
| boost marked (`max(p, 0.6)`) | 18/18 · 0/29 | 7/7 · 9/62 |
| damp unmarked (`p × 0.6`) | 13/18 · 0/29 | 5/7 · 1/62 |
| both | 14/18 · 0/29 | 7/7 · 1/62 |

On the real page every ad was marked and every false positive (staff-written product news) was not, so damping unmarked blocks removes almost all mistakes. The cost is unmarked ads: affiliate boxes, podcast reads and plain banners in the hand-written set carry no label, and damping drops them. Which matters more depends on whether you run it in "highlight" (a false positive is cheap) or "remove" (a false positive hides content) mode.

## Tests

```bash
pnpm test                          # unit tests (jsdom): block selection, disclosure detection, decisions, settings
RUN_MODEL=1 pnpm test              # also runs the real model on eval/blocks.json (CPU, downloads 0.9 GB once)
pnpm e2e                           # builds, loads the extension in Playwright's Chromium, checks tests/fixtures/news.html
node scripts/e2e.mjs <url>         # lists what gets flagged on a real page (DUMP=out.json saves every scored block)
node eval/eval.mjs fp16 [file]     # compares question wordings
```

`pnpm e2e` uses Playwright's Chromium because Google Chrome no longer loads unpacked extensions from the command line. It opens a visible window (WebGPU needs a real GPU context) and keeps its profile in `.e2e-profile/` so the model downloads once.

## Limits

- English only. [GLiNER2.5-multi-Decide](https://huggingface.co/fastino/GLiNER2.5-multi-Decide) would cover other languages once it has an ONNX export.
- It classifies text. An image ad with no text, no frame title and no ad-like markup is invisible to it.
- About 100 ms per block on an M-series Mac with WebGPU, so a page with 60 candidate blocks takes a few seconds; ad-hinted blocks go first. Without WebGPU it falls back to WASM, which is much slower.
- Staff-written product news is its main source of false positives (see "Tuning adScore").
