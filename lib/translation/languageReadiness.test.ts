import { expect, it } from "vitest";
import { languageReadiness } from "./languageReadiness";
it("does not call a glossary complete when a required term is missing", () => {
  expect(
    languageReadiness(
      "nl",
      ["Calm", "Energy"],
      [
        {
          term: "Calm",
          target: "Rust",
          kind: "effect-name",
          status: "approved",
          updated_at: 1,
        },
      ],
      null,
    ).state,
  ).toBe("Glossary in review");
});

import {
  glossaryReleaseRevision,
  type LanguageRelease,
} from "./languageReadiness";
const rows = [
  {
    term: "Calm",
    target: "Rust",
    kind: "effect-name",
    status: "approved" as const,
    updated_at: 1,
  },
];
const now = Date.parse("2026-09-21T12:00:00Z");
const release: LanguageRelease = {
  locale: "nl",
  host: "nl.dose.wiki",
  checkedRevision: "a".repeat(40),
  checkedAt: "2026-09-20T12:00:00Z",
  expiresAt: "2026-10-20T12:00:00Z",
  glossaryRevision: glossaryReleaseRevision(["Calm"], rows),
  contentCoverage: true,
  interfaceCoverage: true,
  routesVerified: true,
  deploymentUrl: "https://dosewiki-verified.vercel.app",
  released: true,
};
it("links only a fully verified release and retains the glossary path", () => {
  expect(languageReadiness("nl", ["Calm"], rows, release, now)).toMatchObject({
    state: "Website available",
    href: "https://nl.dose.wiki",
    glossaryHref: "/glossary?locale=nl",
  });
  for (const patch of [
    { contentCoverage: false },
    { interfaceCoverage: false },
    { routesVerified: false },
    { deploymentUrl: "" },
    { released: false },
    { checkedRevision: "" },
    { host: "attacker.example" },
  ])
    expect(
      languageReadiness("nl", ["Calm"], rows, { ...release, ...patch }, now)
        .href,
    ).toBe("/glossary?locale=nl");
});
it("rejects drafts, changed glossary revisions and expired evidence", () => {
  expect(
    languageReadiness(
      "nl",
      ["Calm"],
      [{ ...rows[0], status: "draft" }],
      release,
      now,
    ).state,
  ).toBe("Glossary in review");
  expect(
    languageReadiness(
      "nl",
      ["Calm"],
      [{ ...rows[0], target: "Kalmte" }],
      release,
      now,
    ),
  ).toMatchObject({ stale: true, href: "/glossary?locale=nl" });
  expect(
    languageReadiness(
      "nl",
      ["Calm"],
      rows,
      { ...release, expiresAt: "2026-09-01" },
      now,
    ),
  ).toMatchObject({ stale: true, href: "/glossary?locale=nl" });
  expect(languageReadiness("nl", ["Calm"], rows, null, now).state).toBe(
    "Website in preparation",
  );
});

import { isUnavailablePublicDynamicPath } from "../next/publicRouteAvailability";
it("rejects unknown public language routes before streaming starts", () => {
  expect(isUnavailablePublicDynamicPath("/glossary/unknown")).toBe(true);
  expect(isUnavailablePublicDynamicPath("/glossary/ar")).toBe(false);
  expect(isUnavailablePublicDynamicPath("/glossary/languages")).toBe(false);
  expect(isUnavailablePublicDynamicPath("/glossary/zh-Hans")).toBe(false);
});

it("invalidates release evidence when review revision changes with identical wording", () => {
  expect(
    languageReadiness(
      "nl",
      ["Calm"],
      [{ ...rows[0], review_revision: 1 }],
      release,
      now,
    ),
  ).toMatchObject({ stale: true, href: "/glossary?locale=nl" });
});
