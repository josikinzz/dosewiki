/**
 * What My reports and the trip report portal say about who owns a published
 * report. Both read from here so the two never disagree: publishing grants no
 * ownership, and an admin assigns a report to the member who wrote it.
 */

export const OWNERSHIP_RULE = "Publishing does not make a report yours: an admin assigns it to the member who wrote it.";

export const MY_REPORTS_EMPTY_DESCRIPTION = `${OWNERSHIP_RULE} A report you submitted with this account's email shows its status under Submissions.`;

/** The portal's publish success notice; names the member when the contact email matches one. */
export function publishedNotice(title: string, suggestedOwner: string | null): string {
  const published = `Published "${title}" to the public trip reports.`;
  return suggestedOwner
    ? `${published} The contact email matches the member ${suggestedOwner}. ${OWNERSHIP_RULE}`
    : published;
}

export function assignedNotice(slug: string, ownerEmail: string): string {
  return `/reports/${slug} now belongs to ${ownerEmail}, who can edit it from My reports.`;
}
