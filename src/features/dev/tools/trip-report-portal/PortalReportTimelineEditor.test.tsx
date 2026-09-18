import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PortalReportTimelineEditor } from "./PortalReportTimelineEditor";
import type { TripReportEditableFields } from "../../../../../server/lib/tripReportEditing";

const draft: TripReportEditableFields = {
  title: "Report",
  subject: { name: "Anon" },
  substances: [],
  onset: [
    { time: "T+0:00", description: "First" },
    { time: "T+0:30", description: "Second" },
  ],
  peak: [],
  offset: [],
  tags: [],
};

describe("PortalReportTimelineEditor", () => {
  it("names every reorder control and reorders entries within the phase", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<PortalReportTimelineEditor draft={draft} onChange={onChange} />);

    expect(screen.getByRole("textbox", { name: "Onset entry 1 timestamp" })).toHaveValue("T+0:00");
    expect(screen.getByRole("button", { name: "Move Onset entry 1 earlier" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Onset entry 2 later" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Move Onset entry 2 earlier" }));

    expect(onChange).toHaveBeenCalledWith({
      ...draft,
      onset: [
        { time: "T+0:30", description: "Second" },
        { time: "T+0:00", description: "First" },
      ],
    });
  });
});
