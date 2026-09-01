import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The public article is server-rendered; a section is a client component only
 * when it owns browser behaviour (state, effects, handlers). Everything else
 * stays a shared component so its code never ships in the article's
 * JavaScript. This pins the split so a stray `"use client"` cannot quietly
 * pull a whole section back into the bundle, and so the client halves that do
 * need the browser keep the directive that lets the server halves render them.
 */
const sectionsDir = __dirname;

function hasUseClientDirective(relativePath: string): boolean {
  const source = readFileSync(join(sectionsDir, relativePath), "utf8");
  return /^\s*(\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["'];/.test(source);
}

describe("article section client boundaries", () => {
  it.each([
    "ContributorsSection.tsx",
    "HarmPotentialSection.tsx",
    "ReviewStatusBanner.tsx",
    "harm-potential/AddictionSubsection.tsx",
    "harm-potential/RisksSubsection.tsx",
  ])("keeps %s a shared component that can render on the server", (file) => {
    expect(hasUseClientDirective(file)).toBe(false);
  });

  it.each([
    "FeedbackSection.tsx",
    "FeedbackForm.tsx",
    "harm-potential/ToxicitySubsection.tsx",
    "harm-potential/EditableHarmText.tsx",
  ])("keeps %s a client component for the behaviour it owns", (file) => {
    expect(hasUseClientDirective(file)).toBe(true);
  });

  it("loads the feedback form on demand rather than with the section", () => {
    const source = readFileSync(join(sectionsDir, "FeedbackSection.tsx"), "utf8");
    expect(source).toMatch(/dynamic\(\s*\(\) => import\("\.\/FeedbackForm"\)/);
    expect(source).not.toMatch(/from "@\/components\/ui\/select"/);
  });
});
