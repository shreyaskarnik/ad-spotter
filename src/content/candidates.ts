// Picks the page blocks worth asking the model about. Pure DOM code, so it
// runs under jsdom in tests; layout-dependent checks are injected.
import { MAX_BLOCK_CHARS } from "../shared/limits";

/** Class/id/attribute fragments that ad slots commonly carry. */
const AD_HINT =
  /(^|[\s_\-:])(ads?|advert(isement)?s?|sponsor(ed|ship)?|promo(ted|tion)?|adsbygoogle|gpt-ad|dfp|ad-?slot|ad-?unit|native-?ad|taboola|outbrain|banner-?ad|interstitial|vignette)([\s_\-:]|$)/i;
/** Frame titles and ids that ad servers use ("3rd party ad content", google_ads_iframe_…, aswift_…). */
const AD_FRAME = /(google_ads_iframe|aswift|\bads?\b|advert|ad content|sponsor)/i;
/** Frames smaller than this are trackers or widgets, not ads worth scoring. */
const MIN_FRAME_WIDTH = 120;
const MIN_FRAME_HEIGHT = 50;
/** Short labels ad slots print above themselves. */
const AD_LABEL =
  /^(sponsored|promoted|advertisement|ad|ads|paid partnership|sponsored content|around the web|recommended for you|promoted stories|from our partners|anzeige|publicité)\b/i;
const BLOCK_SELECTOR = "article, aside, section, li, figure, div, [role=article], [role=complementary]";

export const MIN_CHARS = 30;
/** Blocks longer than this are containers, not a single piece of content. */
export const MAX_CHARS = 1200;
export const MAX_CANDIDATES = 80;

export type Candidate = { element: Element; text: string; hinted: boolean };

export type FindOptions = {
  /** Elements already scored; they are skipped. */
  seen?: WeakSet<Element>;
  isVisible?: (element: Element) => boolean;
  limit?: number;
};

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function rawText(element: Element): string {
  const html = element as HTMLElement;
  // innerText skips hidden text but needs layout; jsdom only has textContent.
  return normalizeText(typeof html.innerText === "string" ? html.innerText : (element.textContent ?? ""));
}

/**
 * Text the model sees for a block: its visible text plus short notes for
 * content the text alone misses (ad iframes, image alt text).
 */
export function blockText(element: Element): string {
  const visible = rawText(element);
  const notes: string[] = [];
  // Display ads are pictures inside iframes with no readable text, so describe
  // the frame instead: its title, id, source and size.
  for (const frame of Array.from(element.querySelectorAll("iframe")).slice(0, 2)) {
    notes.push(frameNote(frame));
  }
  const slot = slotNote(element);
  if (slot) notes.push(slot);
  const lowered = visible.toLowerCase();
  for (const img of Array.from(element.querySelectorAll("img[alt]")).slice(0, 2)) {
    const alt = normalizeText(img.getAttribute("alt") ?? "");
    // Card images usually repeat the headline; only add alt text that is new.
    if (alt && !lowered.includes(alt.toLowerCase())) notes.push(`[image: ${alt.slice(0, 80)}]`);
  }
  return [visible, ...notes].filter(Boolean).join(" ").slice(0, MAX_BLOCK_CHARS);
}

function frameNote(frame: Element): string {
  const parts = ["embedded frame"];
  const title = normalizeText(frame.getAttribute("title") ?? "");
  if (title) parts.push(`titled "${title.slice(0, 60)}"`);
  const id = frame.id || frame.getAttribute("name") || "";
  if (id) parts.push(`id ${id.slice(0, 50)}`);
  const host = hostOf(frame.getAttribute("src"));
  if (host) parts.push(`from ${host}`);
  const { width, height } = frame.getBoundingClientRect();
  if (width > 0 && height > 0) parts.push(`${Math.round(width)}x${Math.round(height)}`);
  return `[${parts.join(", ")}]`;
}

/** Ad-looking ids and class names on the block or the slot inside it. */
function slotNote(element: Element): string | null {
  const slot = hasAdHint(element) ? element : Array.from(element.querySelectorAll("[id], [class]")).find(hasAdHint);
  if (!slot) return null;
  const names = [slot.id, ...(slot.getAttribute("class") ?? "").split(/\s+/)].filter((name) => name && AD_HINT.test(name));
  return names.length ? `[ad slot: ${names.join(" ").slice(0, 80)}]` : null;
}

/**
 * Trackers, widgets and helper frames parked off the page (consent tools
 * measure fonts in a frame at top: -50000px). jsdom has no layout (0x0), so
 * only frames with a measured size are judged.
 */
function isNegligibleFrame(frame: Element): boolean {
  const { width, height, right, bottom } = frame.getBoundingClientRect();
  if (width === 0 && height === 0) return false;
  const tiny = width < MIN_FRAME_WIDTH || height < MIN_FRAME_HEIGHT;
  const offPage = right + window.scrollX <= 0 || bottom + window.scrollY <= 0;
  return tiny || offPage;
}

function hostOf(src: string | null): string | null {
  if (!src) return null;
  try {
    return new URL(src, "https://example.invalid").hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export function hasAdHint(element: Element): boolean {
  const attrs = [
    element.id,
    element.getAttribute("class") ?? "",
    element.getAttribute("data-ad") !== null ? "ad" : "",
    element.getAttribute("data-ad-slot") !== null ? "ad" : "",
    element.getAttribute("aria-label") ?? "",
    element.getAttribute("data-testid") ?? "",
  ];
  if (attrs.some((value) => AD_HINT.test(value))) return true;
  // A short "Sponsored" / "Advertisement" label as the block's first text.
  const first = normalizeText(element.firstElementChild?.textContent ?? "");
  return first.length <= 30 && AD_LABEL.test(first);
}

/**
 * Find candidate blocks under `root`, in two passes:
 * 1. hinted blocks: elements whose attributes or leading label look like an
 *    ad slot, widened to the nearest ancestor with enough text;
 * 2. plain blocks: walking down from the root, the first element that fits
 *    MAX_CHARS and is not itself a list of blocks, so the page is covered by
 *    non-overlapping pieces and a feed is scored item by item.
 * Between the two, visible frames are picked through their container, since
 * a display ad's text is inside the frame. Hinted blocks come first so they
 * are scored before the limit is reached.
 */
export function findCandidates(root: Element, options: FindOptions = {}): Candidate[] {
  const seen = options.seen ?? new WeakSet<Element>();
  const isVisible = options.isVisible ?? (() => true);
  const limit = options.limit ?? MAX_CANDIDATES;
  const lengths = new Map<Element, number>();
  const lengthOf = (element: Element) => {
    let length = lengths.get(element);
    if (length === undefined) {
      length = normalizeText(element.textContent ?? "").length;
      lengths.set(element, length);
    }
    return length;
  };

  const picked: Candidate[] = [];
  const pickedSet = new Set<Element>();
  const overlaps = (element: Element) =>
    Array.from(pickedSet).some((other) => other.contains(element) || element.contains(other));
  const take = (element: Element, hinted: boolean) => {
    if (pickedSet.has(element) || seen.has(element) || overlaps(element) || !isVisible(element)) return;
    const text = blockText(element);
    const hasFrame = element.querySelector("iframe") !== null;
    if (text.length < MIN_CHARS && !(hinted && hasFrame)) return;
    picked.push({ element, text, hinted });
    pickedSet.add(element);
  };

  const all = Array.from(root.querySelectorAll(BLOCK_SELECTOR));

  for (const element of all) {
    if (picked.length >= limit) break;
    if (!hasAdHint(element)) continue;
    // A slot holding a frame is described by the frame; widening it to find
    // more text would climb out of an overlay into the whole page.
    if (element.querySelector("iframe") && lengthOf(element) <= MAX_CHARS) {
      take(element, true);
      continue;
    }
    let target: Element = element;
    for (let depth = 0; depth < 4 && lengthOf(target) < MIN_CHARS && target.parentElement && target.parentElement !== root; depth++) {
      target = target.parentElement;
    }
    if (lengthOf(target) <= MAX_CHARS) take(target, true);
  }

  // Visible frames not covered above, via their nearest block container.
  // Display and interstitial ads often sit in wrappers with no ad-like names,
  // and their text lives inside the frame, where the page can't read it.
  for (const frame of Array.from(root.querySelectorAll("iframe"))) {
    if (picked.length >= limit) break;
    if (!isVisible(frame) || isNegligibleFrame(frame)) continue;
    let target = frame.parentElement;
    while (target && target !== root && !(target.matches(BLOCK_SELECTOR) && lengthOf(target) <= MAX_CHARS)) {
      target = target.parentElement;
    }
    if (!target || target === root) continue;
    const frameSaysAd = AD_FRAME.test(`${frame.getAttribute("title") ?? ""} ${frame.id} ${frame.getAttribute("name") ?? ""}`);
    take(target, frameSaysAd || hasAdHint(target));
  }

  // Walk down from the root: stop at the first block that fits and is not a
  // list of smaller blocks (a feed splits into its items, an article stays
  // whole), otherwise look inside it.
  const substantialChildren = (element: Element) =>
    Array.from(element.children).filter((child) => child.matches(BLOCK_SELECTOR) && lengthOf(child) >= MIN_CHARS).length;
  const stack = Array.from(root.children).reverse();
  while (stack.length > 0 && picked.length < limit) {
    const element = stack.pop()!;
    const length = lengthOf(element);
    if (length < MIN_CHARS) continue;
    const fits = element.matches(BLOCK_SELECTOR) && length <= MAX_CHARS;
    if (fits && substantialChildren(element) < 2) {
      take(element, false);
      continue;
    }
    stack.push(...Array.from(element.children).reverse());
  }

  return picked;
}
