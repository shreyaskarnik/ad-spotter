import { choice } from "open-jev";

export const AD = "paid or sponsored advertisement";
const EDITORIAL = "news, article or editorial content";
const FURNITURE = "navigation, forms or other page furniture";

/**
 * The one question asked of every block, picked with eval/eval.mjs. Two things
 * mattered: an explicit "editorial" option (a plain yes/no question scored
 * product news as ads), and describing editorial blocks by their byline or
 * timestamp, which lifted AUC on real news-site blocks from 0.78 to 0.88.
 */
export const AD_QUESTION = choice("What kind of block is this?", [AD, EDITORIAL, FURNITURE], {
  [AD]: "an advertiser paid to place it: sponsored or promoted posts, display ads, ad frames and ad slots, affiliate buy boxes, sponsored listings, 'around the web' clickbait links",
  [EDITORIAL]: "written by the site's own staff: headlines and story teasers with an author byline or timestamp, news, reviews, deal roundups, comments",
  [FURNITURE]: "menus, footers, sign-up forms, cookie notices",
});

export { MAX_BLOCK_CHARS } from "./limits";
