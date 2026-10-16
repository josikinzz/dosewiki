import contributorProfiles from "@data/contributors/userProfiles.json";
import {
  deriveProfileKeyFromEmail,
  expandLegacyContributorHandles,
  findContributorProfileByKeyOrAlias,
  toContributorDisplayName,
} from "../../../../lib/contributorProfileIdentity";

const LOCAL_CREDENTIAL_EMAIL_DOMAIN = "@local.dose.wiki";
const REVIEWER_PROFILES = contributorProfiles.map((profile) => ({
  ...profile,
  aliases: profile.aliases ?? [],
}));

export function formatReviewerIdentity(value?: string | null): string | null {
  const reviewer = value?.trim();
  if (!reviewer) {
    return null;
  }

  if (!reviewer.toLowerCase().endsWith(LOCAL_CREDENTIAL_EMAIL_DOMAIN)) {
    return reviewer;
  }

  const key = deriveProfileKeyFromEmail(reviewer);
  for (const handle of expandLegacyContributorHandles([key])) {
    const displayName = findContributorProfileByKeyOrAlias(REVIEWER_PROFILES, handle)?.displayName?.trim();
    if (displayName) return displayName;
  }
  return toContributorDisplayName(reviewer.split("@", 1)[0] ?? key);
}
