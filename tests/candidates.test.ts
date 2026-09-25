// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { MAX_CHARS, SCANNED_ATTR, blockText, findCandidates, hasAdHint, normalizeText } from "../src/content/candidates";

const para = (words: number) => Array.from({ length: words }, (_, i) => `word${i}`).join(" ");

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("normalizeText", () => {
  it("collapses whitespace", () => {
    expect(normalizeText("  a \n\n b\t c ")).toBe("a b c");
  });
});

describe("hasAdHint", () => {
  it("matches ad-ish class names and ids but not words that merely contain 'ad'", () => {
    document.body.innerHTML = `
      <div id="a" class="sidebar-ad">x</div>
      <div id="b" class="sponsored-post">x</div>
      <div id="c" class="header download">x</div>
      <div id="dfp-slot-1">x</div>
      <ins id="e" class="adsbygoogle">x</ins>`;
    expect(hasAdHint(document.getElementById("a")!)).toBe(true);
    expect(hasAdHint(document.getElementById("b")!)).toBe(true);
    expect(hasAdHint(document.getElementById("c")!)).toBe(false);
    expect(hasAdHint(document.getElementById("dfp-slot-1")!)).toBe(true);
  });

  it("matches a leading 'Sponsored' label", () => {
    document.body.innerHTML = `<div id="x"><span>Sponsored</span><p>${para(10)}</p></div>`;
    expect(hasAdHint(document.getElementById("x")!)).toBe(true);
  });
});

describe("blockText", () => {
  it("notes ad iframes and image alt text", () => {
    document.body.innerHTML = `<div id="x">Advertisement<iframe src="https://tpc.googlesyndication.com/safeframe/1"></iframe><img alt="Summer sale banner"></div>`;
    expect(blockText(document.getElementById("x")!)).toBe(
      "Advertisement [embedded frame, from tpc.googlesyndication.com] [image: Summer sale banner]",
    );
  });

  it("describes a text-less display ad by its frame and slot", () => {
    document.body.innerHTML = `
      <div id="div-gpt-ad-leaderboard_top" class="dynamic-js-slot dfp_ad--rendered">
        <iframe id="google_ads_iframe_/1234/site/front_page_2" title="3rd party ad content"></iframe>
      </div>`;
    expect(blockText(document.getElementById("div-gpt-ad-leaderboard_top")!)).toBe(
      '[embedded frame, titled "3rd party ad content", id google_ads_iframe_/1234/site/front_page_2] [ad slot: div-gpt-ad-leaderboard_top dfp_ad--rendered]',
    );
  });

  it("skips alt text that repeats the visible text", () => {
    document.body.innerHTML = `<div id="x">Here's the Tesla Semi again ANDREW J. HAWKINS <img alt="Here's the Tesla Semi again"><img alt="Fleet photo"></div>`;
    expect(blockText(document.getElementById("x")!)).toBe("Here's the Tesla Semi again ANDREW J. HAWKINS [image: Fleet photo]");
  });
});

describe("findCandidates", () => {
  it("returns the largest blocks that fit, not their children", () => {
    document.body.innerHTML = `
      <main>
        <article id="one"><h2>Title one</h2><p>${para(20)}</p></article>
        <article id="two"><h2>Title two</h2><p>${para(20)}</p></article>
      </main>`;
    const ids = findCandidates(document.body).map((c) => c.element.id);
    expect(ids).toEqual(["one", "two"]);
  });

  it("splits a short feed into its items instead of scoring it as one block", () => {
    document.body.innerHTML = `
      <div id="feed">
        <div id="p1">${para(8)} one</div>
        <div id="p2">${para(8)} two</div>
        <div id="p3">${para(8)} three</div>
      </div>`;
    expect(findCandidates(document.body).map((c) => c.element.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("puts hinted blocks first and widens a bare label to its container", () => {
    document.body.innerHTML = `
      <article id="story"><p>${para(30)}</p></article>
      <div id="slot"><div class="ad-label">Ad</div><p>Summer sale on flights to Europe, book by Sunday</p></div>`;
    const found = findCandidates(document.body);
    expect(found[0]?.element.id).toBe("slot");
    expect(found[0]?.hinted).toBe(true);
    expect(found.map((c) => c.element.id)).toContain("story");
  });

  it("keeps a hinted slot whose only content is an ad iframe", () => {
    document.body.innerHTML = `<div id="gpt-ad-top"><iframe src="https://ads.example.net/x"></iframe></div>`;
    const found = findCandidates(document.body);
    expect(found).toHaveLength(1);
    expect(found[0]?.text).toContain("ads.example.net");
  });

  it("takes an ad overlay by its frame instead of widening into the page", () => {
    document.body.innerHTML = `
      <article id="story"><p>${para(60)}</p></article>
      <div id="overlay" class="interstitial-wrapper">
        <button>CLOSE</button>
        <div id="frame-box"><iframe id="google_ads_iframe_/8663/site/article_1" title="3rd party ad content"></iframe></div>
      </div>`;
    const found = findCandidates(document.body);
    const overlay = found.find((c) => c.element.id === "overlay");
    expect(overlay?.hinted).toBe(true);
    expect(overlay?.text).toContain("3rd party ad content");
  });

  it("finds frames in wrappers with no ad-like names, marking only ad frames", () => {
    document.body.innerHTML = `
      <div id="plain-box"><div><iframe id="aswift_1" title="Advertisement"></iframe></div></div>
      <figure id="video"><iframe title="Bill Gates on AI regulation" src="https://www.youtube.com/embed/abc"></iframe></figure>`;
    const found = findCandidates(document.body);
    const byId = Object.fromEntries(found.map((c) => [c.element.closest("[id]")?.id, c]));
    expect(Object.keys(byId).sort()).toEqual(["plain-box", "video"]);
    expect(byId["plain-box"]?.hinted).toBe(true);
    expect(byId["video"]?.hinted).toBe(false);
    expect(byId["video"]?.text).toContain("youtube.com");
  });

  it("skips short text, oversized containers, seen and invisible elements", () => {
    document.body.innerHTML = `
      <div id="short">Hello</div>
      <div id="huge">${"x ".repeat(MAX_CHARS)}</div>
      <article id="seen"><p>${para(20)}</p></article>
      <article id="hidden"><p>${para(20)}</p></article>
      <article id="ok"><p>${para(20)}</p></article>`;
    const seen = new WeakSet<Element>([document.getElementById("seen")!]);
    const isVisible = (el: Element) => el.id !== "hidden";
    const ids = findCandidates(document.body, { seen, isVisible }).map((c) => c.element.id);
    expect(ids).toEqual(["ok"]);
  });

  it("does not pick pieces of, or wrappers around, blocks scanned earlier", () => {
    document.body.innerHTML = `
      <div id="wrap">
        <div id="card" ${SCANNED_ATTR}><div id="thumb"></div><div id="inner">Sponsored · Northwind: why 200,000 people switched to the mattress that sleeps cool</div></div>
      </div>
      <article id="fresh"><p>${para(20)}</p></article>`;
    expect(findCandidates(document.body).map((c) => c.element.id)).toEqual(["fresh"]);
  });

  it("stops at the limit", () => {
    document.body.innerHTML = Array.from({ length: 10 }, (_, i) => `<article>${para(12)} ${i}</article>`).join("");
    expect(findCandidates(document.body, { limit: 3 })).toHaveLength(3);
  });
});
