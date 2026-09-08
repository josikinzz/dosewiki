/**
 * Contribution history for the review workbench's direct writes.
 *
 * The workbench edits an article without the editor save flow — an inline field
 * fix, a reference appended from the citation palette — because that flow's
 * diff, commit message, and whole-article send are the wrong weight for a
 * one-word change. The cost was that those edits left no trace: the contributor
 * profile's "Latest contributions" reads the `changelog` table, which only the
 * save flow ever wrote, so a reviewer's inline work was invisible on her own
 * profile. Each direct write records its own single-article entry here instead.
 *
 * The write is best-effort by construction: the article change is already
 * committed to Convex by the time this runs, so a failed history row is logged
 * and swallowed rather than turned into a failed edit.
 */
import { api } from "../../../../convex/_generated/api";
import { publishPublicCache } from "@server/next/publishPublicCache";
import { deriveSubmittedBy } from "../save-to-convex/saveToConvexUtils";
import type { ServerConvexWriteCapability } from "@server/convex/serverWriteCapability";

/** The article a direct edit touched, as the changelog table records it. */
export type DirectEditArticle = {
  /** The article's numeric id; 0 for a row that never received one. */
  id: number;
  title: string;
  slug: string;
};

export type DirectEditChangelogInput = {
  convexWrite: ServerConvexWriteCapability;
  actorEmail: string;
  session: { user: { email: string; name?: string | null } };
  article: DirectEditArticle;
  /** The row's headline, e.g. `Inline edit — dosage.routes[0].notes`. */
  message: string;
  /** Diff body. Lines opening with `+` or `-` render as added/removed. */
  markdown: string;
};

/**
 * Unique per write, not per second: the save flow's date-to-the-second id would
 * collide across a burst of inline edits, and `changelog:addEntry` upserts on
 * it — one edit would silently overwrite another's row.
 */
function buildDirectEntryId(now: Date, slug: string): string {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "");
  return `direct-${stamp}-${slug}-${crypto.randomUUID().slice(0, 8)}`;
}

/** One diff line, or nothing when the value is absent. */
function diffLine(marker: "+" | "-", value: string | null): string | null {
  return value === null ? null : `${marker} ${value}`;
}

/**
 * The changelog markdown for a single before → after value change.
 *
 * `before` is null when nothing was replaced (a first write, an append), which
 * renders as an addition with no removal line; `after` is null for a deletion,
 * which renders as a removal line alone.
 */
export function buildDirectEditDiff(
  title: string,
  heading: string,
  before: string | null,
  after: string | null,
): string {
  return [`# ${title}`, "", `@@ ${heading} @@`, diffLine("-", before), diffLine("+", after)]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export async function recordDirectEditChangelog({
  convexWrite,
  actorEmail,
  session,
  article,
  message,
  markdown,
}: DirectEditChangelogInput): Promise<void> {
  const now = new Date();
  const apiKey =
    convexWrite.getAdminIntentToken?.("editorArticleWrite") ?? convexWrite.adminKey;

  try {
    await convexWrite.client.mutation(api.changelog.addEntry, {
      apiKey,
      actorEmail,
      entryId: buildDirectEntryId(now, article.slug),
      createdAt: now.toISOString(),
      message,
      markdown,
      submittedBy: deriveSubmittedBy(session.user.email, session.user.name),
      articles: [article],
    });
    // The contributor profile reads its history through the changelog, and
    // stale is exactly the complaint this entry exists to answer. The article
    // identity carries its own history leaf alongside the changelog index.
    await publishPublicCache({
      targets: [{ kind: "changelog" }, { kind: "article", slug: article.slug }],
      source: "manual",
    });
  } catch (error) {
    // The article write already landed. Losing its history row is worth a log,
    // never an error response that invites the reviewer to edit again.
    console.warn("Failed to record a direct-edit changelog entry:", error);
  }
}
