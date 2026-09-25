import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CITATION_INTAKE_STATUS,
  FEEDBACK_INTAKE_STATUS,
  INTAKE_STATUSES,
  INTAKE_STATUS_LABEL,
  TRIP_REPORT_INTAKE_STATUS,
} from "./intakeStatus";

const glossary = readFileSync(join(process.cwd(), "docs/glossary.md"), "utf8");

function intakeStatusEntry(): string {
  const start = glossary.indexOf("**Intake Status**:");
  expect(start).toBeGreaterThan(-1);
  const end = glossary.indexOf("\n**", start + 1);
  return glossary.slice(start, end === -1 ? undefined : end);
}

describe("intake status vocabulary", () => {
  it("is the set the glossary lists, word for word", () => {
    const entry = intakeStatusEntry();
    const listed = [...entry.matchAll(/^- \*\*([^*]+)\*\*:/gm)].map((match) => match[1]);
    expect(listed).toEqual(INTAKE_STATUSES.map((status) => INTAKE_STATUS_LABEL[status]));
  });

  it("maps trip reports so published and declined reports read differently", () => {
    expect(INTAKE_STATUS_LABEL[TRIP_REPORT_INTAKE_STATUS.exported]).toBe("Published");
    expect(INTAKE_STATUS_LABEL[TRIP_REPORT_INTAKE_STATUS.published]).toBe("Published");
    expect(INTAKE_STATUS_LABEL[TRIP_REPORT_INTAKE_STATUS.rejected]).toBe("Rejected");
    expect(INTAKE_STATUS_LABEL[TRIP_REPORT_INTAKE_STATUS.spam]).toBe("Spam");
    expect(INTAKE_STATUS_LABEL[TRIP_REPORT_INTAKE_STATUS.submitted]).toBe("New");
  });

  it("gives every tool's decided states the same words", () => {
    expect(CITATION_INTAKE_STATUS.approved).toBe(TRIP_REPORT_INTAKE_STATUS.accepted);
    expect(CITATION_INTAKE_STATUS.rejected).toBe(FEEDBACK_INTAKE_STATUS.rejected);
    expect(TRIP_REPORT_INTAKE_STATUS.rejected).toBe(FEEDBACK_INTAKE_STATUS.rejected);
    expect(TRIP_REPORT_INTAKE_STATUS.spam).toBe(FEEDBACK_INTAKE_STATUS.spam);
  });
});
