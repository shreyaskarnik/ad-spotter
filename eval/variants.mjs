import { choice, noul } from "open-jev";

const AD = "paid or sponsored advertisement";
const CONTENT = "ordinary website content";

export const VARIANTS = {
  choice: {
    question: choice("Is this block a paid or sponsored advertisement, or ordinary website content?", [AD, CONTENT]),
    adProbability: (a) => a.probabilities[AD],
  },
  described: {
    question: choice(
      "Is this block a paid or sponsored advertisement, or ordinary website content?",
      [AD, CONTENT],
      {
        [AD]: "someone paid to place it: sponsored or promoted posts, display ads, affiliate buy boxes, sponsored listings",
        [CONTENT]: "the site's own articles, products, navigation, comments, reviews and sign-up forms",
      },
    ),
    adProbability: (a) => a.probabilities[AD],
  },
  noul: {
    question: noul("This block is a paid or sponsored advertisement."),
    adProbability: (a) => a.probability,
  },
};

const EDITORIAL = "news, article or editorial content";
const FURNITURE = "navigation, forms or other page furniture";
const PLACED = "This block is a paid advertisement placed by an advertiser, not the site's own editorial content.";

VARIANTS.strictNoul = {
  question: noul(PLACED),
  adProbability: (a) => a.probability,
};
VARIANTS.threeWay = {
  question: choice("What kind of block is this?", [AD, EDITORIAL, FURNITURE], {
    [AD]: "an advertiser paid to place it: sponsored or promoted posts, display ads, affiliate buy boxes, sponsored listings",
    [EDITORIAL]: "written by the site: headlines, news, reviews, deal roundups, comments",
    [FURNITURE]: "menus, footers, sign-up forms, cookie notices",
  }),
  adProbability: (a) => a.probabilities[AD],
};

VARIANTS.threeWayChum = {
  question: choice("What kind of block is this?", [AD, EDITORIAL, FURNITURE], {
    [AD]: "an advertiser paid to place it: sponsored or promoted posts, display ads, affiliate buy boxes, sponsored listings, 'around the web' clickbait links",
    [EDITORIAL]: "written by the site: headlines, news, reviews, deal roundups, comments",
    [FURNITURE]: "menus, footers, sign-up forms, cookie notices",
  }),
  adProbability: (a) => a.probabilities[AD],
};

VARIANTS.threeWayByline = {
  question: choice("What kind of block is this?", [AD, EDITORIAL, FURNITURE], {
    [AD]: "an advertiser paid to place it: sponsored or promoted posts, display ads, ad frames and ad slots, affiliate buy boxes, sponsored listings, 'around the web' clickbait links",
    [EDITORIAL]: "written by the site's own staff: headlines and story teasers with an author byline or timestamp, news, reviews, deal roundups, comments",
    [FURNITURE]: "menus, footers, sign-up forms, cookie notices",
  }),
  adProbability: (a) => a.probabilities[AD],
};
