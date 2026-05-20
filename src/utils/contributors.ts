import { publicHref } from "./publicHref";

const CONTRIBUTOR_SLUG_MAP: Record<string, string> = {
  "Josie Kins": "josie",
  "Kaytwo": "kaytwo",
};

export function getContributorSlug(name: string) {
  return CONTRIBUTOR_SLUG_MAP[name] ?? name.toLowerCase();
}

export function getContributorPath(name: string) {
  return publicHref.contributor(getContributorSlug(name));
}
