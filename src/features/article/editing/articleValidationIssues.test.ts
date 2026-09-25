import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { fullArticleWithDosage } from "@/test/fixtures/articles";
import type { SubstanceArticle } from "@/schema";
import { articleValidationIssues, describeValidationIssue, fieldIssueMessage, issueConcernsField } from "./useArticleLifecycle";
import { articleSectionForPath } from "./articleSections";

const published = structuredClone(fullArticleWithDosage) as SubstanceArticle;

function edited(change: (article: SubstanceArticle) => void): SubstanceArticle {
  const article = structuredClone(published);
  change(article);
  return article;
}

describe("article validation issues", () => {
  it("carry the section whose form edits the field", () => {
    const [issue] = articleValidationIssues(edited((article) => {
      article.dosage.routes[0].dose_ranges.moderate = { min: 200, max: 100, unit: "μg" };
    }), published);
    expect(issue).toMatchObject({ path: "dosage.routes[0].dose_ranges.moderate", sectionId: "dosage" });
    expect(describeValidationIssue(issue)).toBe("Dosage and duration › Routes 1 › Dose ranges › Moderate: Minimum cannot exceed maximum.");
  });

  it("send a duration field to the dosage section that hosts it", () => {
    const [issue] = articleValidationIssues(edited((article) => {
      article.duration.routes[0].stages.onset = { min: 15, max: 30, unit: "mg" };
    }), published);
    expect(issue.path).toBe("duration.routes[0].stages.onset.unit");
    expect(issue.sectionId).toBe("dosage");
  });

  it("reach the field they concern by path, and no other", () => {
    const issues = articleValidationIssues(edited((article) => {
      article.dosage.routes[0].dose_ranges.moderate = { min: 200, max: 100, unit: "μg" };
    }), published);
    expect(fieldIssueMessage(issues, "dosage.routes[0].dose_ranges.moderate")).toBe("Minimum cannot exceed maximum.");
    expect(fieldIssueMessage(issues, "dosage.routes[0].dose_ranges.mod")).toBeNull();
    expect(fieldIssueMessage(issues, "dosage.routes[1].dose_ranges.moderate")).toBeNull();
    // A group rule reaches each member; a part of a range reaches the range.
    expect(issueConcernsField("dosage.routes[0].dose_ranges", "dosage.routes[0].dose_ranges.light")).toBe(true);
    expect(issueConcernsField("duration.routes[0].stages.onset.unit", "duration.routes[0].stages.onset")).toBe(true);
    expect(issueConcernsField("dosage.routes[1]", "dosage.routes[10].notes")).toBe(false);
  });

  it("name no section for a field no in-page section owns", () => {
    expect(articleSectionForPath("identity")).toBeNull();
    expect(articleSectionForPath("constructor")).toBeNull();
    expect(articleSectionForPath("title")).toBe("identification");
  });

  it("are never parsed from message text to find a section", () => {
    // The section comes from `sectionId`. Splitting a problem or message
    // string to guess the section is the pattern this guards against.
    for (const file of ["ArticleContextBridge.editor.tsx", "ArticleSectionForm.tsx", "useArticleLifecycle.ts"]) {
      const source = readFileSync(join(__dirname, file), "utf8");
      expect(source, file).not.toMatch(/\b(?:problem|message|issue|error)s?\b[\w.]*\.split\(/);
      expect(source, file).not.toMatch(/as ArticleEditorSection/);
    }
  });
});
