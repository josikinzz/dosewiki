import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ChangeLogEntry } from "@/data/changelog/changeLog";
import { UserContributionsSection } from "./UserProfileExpandableSections";

const entry = (overrides: Partial<ChangeLogEntry> = {}): ChangeLogEntry => ({
  id: "entry-1",
  createdAt: "2026-08-13T18:05:00.000Z",
  commit: { sha: "", url: "", message: "Corrected 2C-B tolerance curve wording" },
  articles: [{ id: 101, title: "2C-B", slug: "2c-b" }],
  markdown: "- old wording\n+ new wording",
  submittedBy: "LYREA",
  ...overrides,
});

describe("UserContributionsSection", () => {
  it("shows no diff text at rest and reveals it through the row expander", async () => {
    const user = userEvent.setup();
    render(<UserContributionsSection profileKey="LYREA" history={[entry()]} />);

    expect(screen.getByText("Corrected 2C-B tolerance curve wording")).toBeInTheDocument();
    expect(screen.queryByText(/new wording/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show change diff" }));

    expect(screen.getByLabelText("Diff of changed lines")).toHaveTextContent("new wording");

    await user.click(screen.getByRole("button", { name: "Hide change diff" }));

    expect(screen.queryByText(/new wording/)).not.toBeInTheDocument();
  });

  it("renders no expander for an entry without a diff", () => {
    render(<UserContributionsSection profileKey="LYREA" history={[entry({ markdown: "" })]} />);

    expect(screen.queryByRole("button", { name: "Show change diff" })).not.toBeInTheDocument();
  });

  it("groups rows under day headings", () => {
    render(
      <UserContributionsSection
        profileKey="LYREA"
        history={[
          entry({ id: "a", createdAt: "2026-08-13T18:05:00.000Z" }),
          entry({ id: "b", createdAt: "2026-08-13T09:00:00.000Z" }),
          entry({ id: "c", createdAt: "2026-08-12T10:00:00.000Z" }),
        ]}
      />,
    );

    // Two distinct days -> two group headings, not one per row.
    expect(screen.getByText("Aug 13, 2026")).toBeInTheDocument();
    expect(screen.getByText("Aug 12, 2026")).toBeInTheDocument();
  });

  it("collapses to four rows and expands the remainder through the count control", async () => {
    const user = userEvent.setup();
    const history = Array.from({ length: 6 }, (_, index) =>
      entry({
        id: `entry-${index}`,
        createdAt: `2026-08-${String(14 - index).padStart(2, "0")}T12:00:00.000Z`,
        commit: { sha: "", url: "", message: `Save ${index}` },
      }),
    );

    render(<UserContributionsSection profileKey="LYREA" history={history} />);

    expect(screen.getAllByText(/^Save \d$/)).toHaveLength(4);

    await user.click(screen.getByRole("button", { name: "Expand contributions" }));

    expect(screen.getAllByText(/^Save \d$/)).toHaveLength(6);
  });
});
