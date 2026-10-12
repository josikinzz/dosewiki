import { glossaryHref as publicGlossaryHref } from "../../src/features/language-glossary/glossaryRoutes";
import { createHash } from "node:crypto";
import type { Rendering } from "../../src/features/language-glossary/languageGlossary";

export type LanguageRelease = {
  locale: string;
  host: string;
  checkedRevision: string;
  checkedAt: string;
  expiresAt: string;
  glossaryRevision: string;
  contentCoverage: boolean;
  interfaceCoverage: boolean;
  routesVerified: boolean;
  deploymentUrl: string;
  released: boolean;
};
export function glossaryReleaseRevision(
  required: readonly string[],
  rows: readonly Rendering[],
): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        [...required].sort(),
        [...rows]
          .sort((a, b) => a.term.localeCompare(b.term))
          .map((row) => [
            row.term,
            row.target,
            row.kind,
            row.status,
            row.updated_at,
            row.review_revision ?? 0,
          ]),
      ]),
    )
    .digest("hex");
}
/** Fail closed: a configured host or zero drafts is never release evidence. */
export function languageReadiness(
  locale: string,
  required: readonly string[],
  rows: readonly Rendering[],
  release: LanguageRelease | null,
  now = Date.now(),
) {
  const glossaryHref = publicGlossaryHref(locale);
  const byTerm = new Map(rows.map((row) => [row.term, row]));
  const complete =
    required.length > 0 &&
    required.every(
      (term) =>
        byTerm.get(term)?.status === "approved" &&
        byTerm.get(term)?.target.trim(),
    ) &&
    rows.every((row) => row.status === "approved");
  const revision = glossaryReleaseRevision(required, rows);
  const stale = Boolean(
    release &&
    (release.glossaryRevision !== revision ||
      !Number.isFinite(Date.parse(release.expiresAt)) ||
      Date.parse(release.expiresAt) <= now),
  );
  const verified =
    complete &&
    release?.released &&
    release.locale === locale &&
    !stale &&
    /^[a-z0-9-]+\.dose\.wiki$/.test(release.host) &&
    /^[a-f0-9]{40}$/.test(release.checkedRevision) &&
    Number.isFinite(Date.parse(release.checkedAt)) &&
    Date.parse(release.checkedAt) <= now &&
    Date.parse(release.expiresAt) > Date.parse(release.checkedAt) &&
    release.contentCoverage &&
    release.interfaceCoverage &&
    release.routesVerified &&
    /^https:\/\/[a-z0-9-]+\.vercel\.app\/?$/.test(release.deploymentUrl);
  return {
    state: verified
      ? "Website available"
      : complete
        ? "Website in preparation"
        : "Glossary in review",
    href: verified ? `https://${release.host}` : glossaryHref,
    glossaryHref,
    revision,
    stale,
  };
}
