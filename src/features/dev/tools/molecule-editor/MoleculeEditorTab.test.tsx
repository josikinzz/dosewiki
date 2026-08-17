import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import {
  installMoleculeEditorTestHarness,
  usePaginatedQueryMock,
  useQueryMock,
  useSubstanceLookupMock,
} from "./MoleculeEditorTab.testHarness";
import { MoleculeEditorTab } from "./MoleculeEditorTab";

describe("MoleculeEditorTab modes", () => {
  installMoleculeEditorTestHarness();

  it("renders the editor panel header on mount", async () => {
    useQueryMock.mockReturnValue(undefined);
    render(<MoleculeEditorTab />);
    await waitFor(() =>
      expect(screen.getByText("Molecule depiction editor")).toBeInTheDocument(),
    );
  });

  it("uses and drains the paginated search projection for class templates", async () => {
    const loadMore = vi.fn();
    useQueryMock.mockReturnValue(undefined);
    usePaginatedQueryMock.mockReturnValue({
      results: [],
      status: "CanLoadMore",
      loadMore,
    });
    const user = userEvent.setup();
    render(<MoleculeEditorTab />);

    const [query, args, options] = usePaginatedQueryMock.mock.calls[0];
    expect(getFunctionName(query)).toBe("substanceIndex:getSearchInputPage");
    expect(args).toBe("skip");
    expect(options).toEqual({ initialNumItems: 32 });

    await user.click(screen.getByRole("button", { name: "Class templates" }));
    await waitFor(() => expect(loadMore).toHaveBeenCalledWith(32));
  });

  it("separates the saved-depiction pill from the published-article pill", async () => {
    useSubstanceLookupMock.mockReturnValue({
      lookup: [
        {
          slug: "listed-no-depiction",
          name: "Listed No Depiction",
          priority: "normal",
          psychoactiveClasses: ["Psychedelic"],
        },
        {
          slug: "unlisted-with-depiction",
          name: "Unlisted With Depiction",
          priority: "low",
          psychoactiveClasses: ["Stimulant"],
        },
      ],
      isLoading: false,
      status: "Exhausted",
    });
    useQueryMock.mockImplementation((query) => {
      const functionName = getFunctionName(query);
      if (functionName === "moleculeOverrides:listSlugs") {
        return [{ slug: "unlisted-with-depiction" }];
      }
      return undefined;
    });

    render(<MoleculeEditorTab />);
    expect(
      screen.getByText("2 substances · 1 saved depictions · 1 published articles"),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Select a substance" }));

    // The listed article leads the list under its category heading, carrying only
    // the article pill; the unlisted one carries only the depiction pill.
    expect(await screen.findByText("Psychedelic")).toBeInTheDocument();
    expect(screen.getByText("Stimulant · not publicly listed")).toBeInTheDocument();
    expect(screen.getByText("published")).toBeInTheDocument();
    expect(screen.getByText("saved")).toBeInTheDocument();
  });

  it("shows the substance loading state while Convex data is pending", () => {
    useSubstanceLookupMock.mockReturnValue({
      lookup: undefined,
      isLoading: true,
      status: "CanLoadMore",
    });
    useQueryMock.mockReturnValue(undefined);
    render(<MoleculeEditorTab />);
    expect(screen.getByText("Loading substances…")).toBeInTheDocument();
  });

  it("loads 1,4-Butanediol without evaluating class-template membership", async () => {
    const savedMolblock = "saved molblock";
    useSubstanceLookupMock.mockReturnValue({
      lookup: [{ slug: "1-4-butanediol", name: "1,4-Butanediol" }],
      isLoading: false,
      status: "Exhausted",
    });
    useQueryMock.mockImplementation((query, args) => {
      const functionName = getFunctionName(query);
      if (functionName === "moleculeOverrides:listSlugs") {
        return [{ slug: "1-4-butanediol" }];
      }
      if (functionName === "substanceIndex:getBySlug") {
        return args === "skip" ? undefined : { identification: { smiles: "C" } };
      }
      return undefined;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          override: {
            slug: "1-4-butanediol",
            molblock: savedMolblock,
            svg: "<svg />",
            updatedAt: "2026-07-12T00:00:00.000Z",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    render(<MoleculeEditorTab />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox", { name: "Select a substance" }));
    await user.click(await screen.findByText("1,4-Butanediol"));

    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", savedMolblock),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/dev/molecule-override?slug=1-4-butanediol",
    );
    expect(screen.queryByText("Couldn't load depiction")).not.toBeInTheDocument();
    const leftRightFlip = screen.getByRole("button", { name: "Flip left/right" });
    const upDownFlip = screen.getByRole("button", { name: "Flip up/down" });
    expect(leftRightFlip).toBeEnabled();
    expect(upDownFlip).toBeEnabled();

    const fineRotation = screen.getByRole("checkbox", { name: "Fine rotation" });
    expect(fineRotation).toBeChecked();
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-fine-rotation", "true");

    fineRotation.focus();
    await user.keyboard(" ");
    expect(fineRotation).not.toBeChecked();
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-fine-rotation", "false");
    expect(screen.getByRole("button", { name: "Save depiction" })).toBeDisabled();

    await user.click(leftRightFlip);
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-mirror-direction", "left-right");
    await user.click(screen.getByRole("button", { name: "Complete mirror request" }));
    await waitFor(() =>
      expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-mirror-direction", ""),
    );

    await user.click(upDownFlip);
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-mirror-direction", "up-down");
  });

});
