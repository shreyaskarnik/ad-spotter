import type { AdAction } from "../shared/settings";

export const FLAG_CLASS = "ad-spotter-flag";
export const HIDE_CLASS = "ad-spotter-hidden";

/**
 * Explicit ad disclosure in the block's text: a standalone "Sponsored",
 * "Promoted", "Advertisement", "Paid partnership" or "#ad" label, or a
 * leading "Ad". Labels are matched capitalised or all caps (CSS
 * text-transform shows up in innerText), so a mid-sentence "sponsored by the
 * city" in an article does not count.
 */
const DISCLOSURE =
  /(?:^|[^\p{L}#])(?:Sponsored|SPONSORED|Promoted|PROMOTED|Advertisement|ADVERTISEMENT|Paid partnership|PAID PARTNERSHIP|Paid post|#ad|Anzeige|ANZEIGE)(?=$|[^\p{L}])|^(?:Ad|AD)(?=$|[^\p{L}])/u;

export function hasDisclosure(text: string): boolean {
  return DISCLOSURE.test(text);
}

/**
 * Final ad score for a block, from the model's p(ad) and whether the page
 * itself marks the block as an ad: a disclosure label ("Sponsored",
 * "Advertisement", …) or ad-slot markup (ids and classes like div-gpt-ad,
 * m-ad, adsbygoogle).
 *
 * The model alone is unsure on real pages. On a news front page, staff-written
 * headline cards about products scored 0.5–0.8 while carrying no label and no
 * ad markup; the real ads there all had one or the other. In the other
 * direction, a clickbait headline scores 0.36 with a "· Sponsored" tag and
 * 0.06 without. But marking is not proof either: an article can mention
 * "Sponsored" in a headline, and a site can reuse ad-slot classes for its own
 * promos.
 */
export function adScore(p: number, marked: boolean): number {
  // TODO(you): decide how much the page's own marking should count. See the
  // README section "Tuning adScore". Until then the model's score is used as is.
  void marked;
  return p;
}

export function isAd(p: number, threshold: number): boolean {
  return p >= threshold;
}

export function labelFor(p: number): string {
  return `Ad ${Math.round(p * 100)}%`;
}

/** Put an element in the state its score calls for; returns whether it is flagged. */
export function applyScore(element: Element, p: number, threshold: number, action: AdAction): boolean {
  const flagged = isAd(p, threshold);
  element.classList.toggle(FLAG_CLASS, flagged && action === "highlight");
  element.classList.toggle(HIDE_CLASS, flagged && action === "remove");
  if (flagged) element.setAttribute("data-ad-spotter-label", labelFor(p));
  else element.removeAttribute("data-ad-spotter-label");
  return flagged;
}

export function clearScore(element: Element): void {
  element.classList.remove(FLAG_CLASS, HIDE_CLASS);
  element.removeAttribute("data-ad-spotter-label");
}
