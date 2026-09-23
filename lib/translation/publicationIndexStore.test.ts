import { describe, expect, it, vi } from "vitest";
import { PostgresDatabaseWriter } from "../postgres/runtime/db";
import { patchDocument } from "../postgres/documentStore";
import { refreshLocalizedPublicationIndexes } from "./publicationIndexStore";

vi.mock("server-only", () => ({}));

type IndexRow = { locale: string; publication_id: string; source_revision: string; dependency_hashes: string[]; dirty: boolean };

const EDITED = "e".repeat(32);

/** In-memory stand-in for the index table: evaluates the pending read's scope parameters and records per-row materialization. */
function fakeIndexDatabase(rows: IndexRow[]) {
  const materialized: string[] = [];
  const article = { _id: EDITED, _creationTime: 1, slug: "edited", title: "Edited", tags: "[]", body_raw: "Body", publication_status: "published" };
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.startsWith('UPDATE "localizedPublicationIndexState"')) return { rows: [], rowCount: 1 };
    if (sql.startsWith('SELECT "locale", "publication_id", "source_revision" FROM "localizedPublicationIndexes"')) {
      const [publicationId, locale, segmentLocales, segmentHashes] = params as [string | null, string | null, string[] | null, string[] | null];
      const pending = rows.filter((row) => row.dirty
        && (publicationId === null || row.publication_id === publicationId)
        && (locale === null || row.locale === locale)
        && (segmentLocales === null || segmentLocales.some((segmentLocale, index) =>
          segmentLocale === row.locale && row.dependency_hashes.includes(segmentHashes![index]))));
      return { rows: pending.map(({ locale: l, publication_id, source_revision }) => ({ locale: l, publication_id, source_revision })), rowCount: pending.length };
    }
    if (sql.includes('FROM "effectIndexArticles" WHERE "_id" = $1')) {
      return params[0] === EDITED ? { rows: [article], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (sql.startsWith('DELETE FROM "localizedPublicationIndexes"') || sql.startsWith('UPDATE "localizedPublicationIndexes"')) {
      materialized.push(`${params[0]}/${params[1]}`);
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 1 };
  });
  return { executor: { query, statements: 0 }, materialized };
}

function backlog(): IndexRow[] {
  const rows: IndexRow[] = Array.from({ length: 50 }, (_, index) => ({
    locale: "zh-Hans", publication_id: `other-${index}`, source_revision: "r", dependency_hashes: [`hash-${index}`], dirty: true,
  }));
  rows.push({ locale: "zh-Hans", publication_id: EDITED, source_revision: "r", dependency_hashes: ["hash-edited"], dirty: true });
  return rows;
}

describe("scoped localized publication index refresh", () => {
  it("refreshes only the edited publication when an effect article is patched through the runtime writer", async () => {
    const { executor, materialized } = fakeIndexDatabase(backlog());
    await new PostgresDatabaseWriter(executor, new Map()).patch("effectIndexArticles", EDITED, { title: "Edited again" });
    expect(materialized).toEqual([`zh-Hans/${EDITED}`]);
  });

  it("refreshes only the edited publication when an effect article is patched through the document store", async () => {
    const { executor, materialized } = fakeIndexDatabase(backlog());
    await patchDocument(executor as never, "effectIndexArticles", EDITED, { title: "Edited again" });
    expect(materialized).toEqual([`zh-Hans/${EDITED}`]);
  });

  it("refreshes only the publications that depend on written segments", async () => {
    const { executor, materialized } = fakeIndexDatabase(backlog());
    const count = await refreshLocalizedPublicationIndexes(executor, { segments: [{ locale: "zh-Hans", hash: "hash-7" }, { locale: "es", hash: "hash-8" }] });
    expect(count).toBe(1);
    expect(materialized).toEqual(["zh-Hans/other-7"]);
  });

  it("clears the whole backlog for the backfill scope", async () => {
    const { executor, materialized } = fakeIndexDatabase(backlog());
    expect(await refreshLocalizedPublicationIndexes(executor, { backlog: true, locale: "zh-Hans" })).toBe(51);
    expect(materialized).toHaveLength(51);
  });
});
