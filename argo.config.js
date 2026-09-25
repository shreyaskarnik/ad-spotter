import { defineConfig } from "@argo-video/cli";

// The demo launches its own Chromium with the extension loaded (Playwright's
// standard page fixture can't load unpacked extensions), so baseURL and
// browser here only matter for Argo's generated Playwright config.
export default defineConfig({
  baseURL: "http://localhost:5391",
  demosDir: "demos",
  outputDir: "videos",
  tts: { defaultVoice: "af_heart", defaultSpeed: 1.0 },
  video: {
    width: 1440,
    height: 900,
    fps: 30,
    browser: "chromium",
    deviceScaleFactor: 1,
    captureMode: "jpeg-stitch",
  },
  export: { preset: "slow", crf: 18 },
  overlays: { autoBackground: true },
});
