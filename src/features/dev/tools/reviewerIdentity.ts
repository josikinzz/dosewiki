import contributorProfiles from "@data/contributors/userProfiles.json";
import {
  deriveProfileKeyFromEmail,
  findContributorProfileByKeyOrAlias,
  toContributorDisplayName,
} from "../../../../lib/contributorProfileIdentity";

const LOCAL_CREDENTIAL_EMAIL_DOMAIN = "@local.dose.wiki";
const REVIEWER_PROFILES = contributorProfiles.map((profile) => ({
  ...profile,
  aliases: profile.aliases ?? [],
}));

/**
 * Turns an internal credential address into the contributor identity editors
 * recognize. External addresses are intentionally left untouched.
 */
export function formatReviewerIdentity(value?: string | null): string | null {
  const reviewer = value?.trim();
  if (!reviewer) {
    return null;
  }

  if (!reviewer.toLowerCase().endsWith(LOCAL_CREDENTIAL_EMAIL_DOMAIN)) {
    return reviewer;
  }

  const key = deriveProfileKeyFromEmail(reviewer);
  const profile = findContributorProfileByKeyOrAlias(REVIEWER_PROFILES, key);
  return profile?.displayName?.trim() || toContributorDisplayName(reviewer.split("@", 1)[0] ?? key);
}
