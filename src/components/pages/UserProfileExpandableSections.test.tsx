import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicProfileHistoryEntry } from "@server/data/publicData.changelog";
import { formattingLocale } from "@/i18n/messages";
import { UserContributionsSection } from "./UserProfileExpandableSections";

const entry = (overrides: Partial<PublicProfileHistoryEntry> = {}): PublicProfileHistoryEntry => ({
  id: "entry-1",
  createdAt: "2026-08-13T18:05:00.000Z",
  commit: { sha: "", url: "", message: "Corrected 2C-B tolerance curve wording" },
  articles: [{ id: 101, title: "2C-B", slug: "2c-b" }],
  hasDiff: true,
  submittedBy: "LYREA",
  ...overrides,
});

afterEach(() => vi.unstubAllGlobals());

describe("UserContributionsSection", () => {
  it("shows no diff text at rest and reveals it through the row expander", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ markdown: "@@ summary @@\n- old wording\n+ new wording" }),
    });
    vi.stubGlobal("fetch", fetcher);
    const user = userEvent.setup();
    render(<UserContributionsSection profileKey="LYREA" history={[entry()]} />);

    expect(screen.getByText("Corrected 2C-B tolerance curve wording")).toBeInTheDocument();
    expect(screen.queryByText(/new wording/)).not.toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Show change diff" }));

    expect(await screen.findByLabelText("Diff of changed lines")).toHaveTextContent("new wording");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/history/entry-1?view=entry",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await user.click(screen.getByRole("button", { name: "Hide change diff" }));

    expect(screen.getByText(/new wording/)).not.toBeVisible();
  });

  it("renders no expander for an entry without a diff", () => {
    render(<UserContributionsSection profileKey="LYREA" history={[entry({ hasDiff: false })]} />);

    expect(screen.queryByRole("button", { name: "Show change diff" })).not.toBeInTheDocument();
  });

  it("groups rows under day headings", () => {
    render(
      <UserContributionsSection
        profileKey="LYREA"
        history={[
          entry({
            id: "a",
            createdAt: "2026-08-13T12:05:00.000Z",
            commit: { sha: "", url: "", message: "First same-day contribution" },
          }),
          entry({
            id: "b",
            createdAt: "2026-08-13T12:00:00.000Z",
            commit: { sha: "", url: "", message: "Second same-day contribution" },
          }),
          entry({
            id: "c",
            createdAt: "2026-08-12T12:00:00.000Z",
            commit: { sha: "", url: "", message: "Previous-day contribution" },
          }),
        ]}
      />,
    );

    const dayFormat = new Intl.DateTimeFormat(formattingLocale("en"), {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const currentDay = screen.getByText(dayFormat.format(new Date("2026-08-13T12:05:00.000Z")));
    const previousDay = screen.getByText(dayFormat.format(new Date("2026-08-12T12:00:00.000Z")));
    const currentGroup = within(currentDay.parentElement!);
    const previousGroup = within(previousDay.parentElement!);

    expect(currentGroup.getByText("First same-day contribution")).toBeInTheDocument();
    expect(currentGroup.getByText("Second same-day contribution")).toBeInTheDocument();
    expect(currentGroup.queryByText("Previous-day contribution")).not.toBeInTheDocument();
    expect(previousGroup.getByText("Previous-day contribution")).toBeInTheDocument();
    expect(previousGroup.queryByText("First same-day contribution")).not.toBeInTheDocument();
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
