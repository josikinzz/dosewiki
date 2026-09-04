import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoleGuide } from "@/features/dev/tools/members/RoleGuide";
import { ROLE_DESCRIPTIONS } from "@/lib/auth/roleDescriptions";
describe("RoleGuide", () => {
  it("renders every can and cannot line for each role", () => {
    render(<RoleGuide roles={[ROLE_DESCRIPTIONS.admin, ROLE_DESCRIPTIONS.editor, ROLE_DESCRIPTIONS.contributor]} />);
    for (const r of ["admin", "editor", "contributor"] as const) {
      for (const line of [...ROLE_DESCRIPTIONS[r].can, ...ROLE_DESCRIPTIONS[r].cannot]) expect(screen.getAllByText(line).length).toBeGreaterThan(0);
    }
  });
});
