import type { PublicCachePublication } from "@server/next/publishPublicCache";
import type * as NextCache from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const publishMocks = vi.hoisted(() => ({
  publishPublicCache: vi.fn(async (_publication: PublicCachePublication) => []),
}));

const translationMocks = vi.hoisted(() => ({
  enqueueTranslationJobs: vi.fn(async () => undefined),
}));

const cacheMocks = vi.hoisted(() => ({ revalidatePath: vi.fn() }));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<typeof NextCache>()),
  revalidatePath: cacheMocks.revalidatePath,
}));

vi.mock("@server/next/publishPublicCache", () => ({
  publishPublicCache: publishMocks.publishPublicCache,
}));

vi.mock("@server/translation/segmentStore", () => ({
  enqueueTranslationJobs: translationMocks.enqueueTranslationJobs,
}));

import { revalidateContributorSurfaces } from "./contributorRevalidation";

function publishedTargets() {
  expect(publishMocks.publishPublicCache).toHaveBeenCalledTimes(1);
  return publishMocks.publishPublicCache.mock.calls[0]![0].targets;
}

beforeEach(() => {
  publishMocks.publishPublicCache.mockClear();
  cacheMocks.revalidatePath.mockClear();
  translationMocks.enqueueTranslationJobs.mockClear();
});

describe("contributor surface publication", () => {
  it("publishes the edited profiles and the About page for a profile save", async () => {
    await revalidateContributorSurfaces({ contributorKeys: ["ADA", "ada-two"], scope: "profile" });

    expect(publishedTargets()).toEqual([
      { kind: "contributor", slug: "ada" },
      { kind: "contributor", slug: "ada-two" },
      { kind: "about" },
    ]);
    expect(translationMocks.enqueueTranslationJobs).toHaveBeenCalledWith(
      ["zh-Hans"],
      ["profile/ada", "profile/ada-two"],
    );
  });

  it("adds the replication corpus for a profile save that flipped gallery visibility", async () => {
    await revalidateContributorSurfaces({
      contributorKeys: ["ADA"],
      scope: "profile",
      galleryVisibilityChanged: true,
    });

    expect(publishedTargets()).toEqual([
      { kind: "contributor", slug: "ada" },
      { kind: "replication-collections" },
      { kind: "about" },
    ]);
  });

  it("publishes the reordered works and reports without the About page for an ordering save", async () => {
    await revalidateContributorSurfaces({ contributorKeys: ["ADA"], scope: "ordering" });

    expect(publishedTargets()).toEqual([
      { kind: "contributor", slug: "ada" },
      { kind: "replication-collections" },
      { kind: "report-lists" },
    ]);
    expect(translationMocks.enqueueTranslationJobs).not.toHaveBeenCalled();
  });

  it("publishes every surface a byline retarget rewrote", async () => {
    await revalidateContributorSurfaces({ contributorKeys: ["ADA"], scope: "attribution" });

    expect(publishedTargets()).toEqual([
      { kind: "contributor", slug: "ada" },
      { kind: "replication-collections" },
      { kind: "report-lists" },
      { kind: "about" },
    ]);
  });

  it("falls back to the contributors index for a key the contract cannot carry", async () => {
    await revalidateContributorSurfaces({
      contributorKeys: ["ada@example.com", ""],
      scope: "ordering",
    });

    expect(publishedTargets()).toEqual([
      { kind: "contributor-lists" },
      { kind: "replication-collections" },
      { kind: "report-lists" },
    ]);
    expect(cacheMocks.revalidatePath.mock.calls).toEqual([
      ["/contributors/ada%40example.com"],
      ["/replications/artist/[key]", "page"],
    ]);
  });
});
