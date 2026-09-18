/**
 * One effect article a contributor is credited on.
 *
 * Deliberately just the slug and the display name: the contributor profile
 * renders these as a tag list, and nothing about a tag needs the article's
 * summary, tags or body. Keeping the shape this thin is also what makes a
 * 225-entry list cheap to render.
 */
export type ContributorEffectCredit = {
  slug: string;
  name: string;
};
