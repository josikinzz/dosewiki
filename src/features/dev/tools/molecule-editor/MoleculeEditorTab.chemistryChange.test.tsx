import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  compareInchiMock,
  installMoleculeEditorTestHarness,
  seedExampleSubstance,
  stubOverrideFetch,
} from "./MoleculeEditorTab.testHarness";
import { MoleculeEditorTab } from "./MoleculeEditorTab";

const BEFORE_INCHI = "InChI=1S/C10H15N/c1-9(11-2)8-10-6-4-3-5-7-10/h3-7,9,11H,8H2,1-2H3/t9-/m0/s1";
const AFTER_INCHI = "InChI=1S/C10H15N/c1-9(11-2)8-10-6-4-3-5-7-10/h3-7,9,11H,8H2,1-2H3/t9-/m1/s1";
const SAVED_REVISION = "2026-07-12T00:00:00.000Z";

async function openExampleWithEdit() {
  render(<MoleculeEditorTab />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("combobox", { name: "Select a substance" }));
  await user.click(await screen.findByText("Example"));
  await waitFor(() =>
    expect(screen.getByTestId("ocl-editor")).toHaveAttribute("data-source", "saved molblock"),
  );
  await user.click(screen.getByRole("button", { name: "Emit rotation" }));
  return user;
}

function saveBodies(fetchSpy: ReturnType<typeof stubOverrideFetch>) {
  return fetchSpy.mock.calls
    .filter(([url, init]) => url === "/api/dev/molecule-override" && init?.method === "POST")
    .map(([, init]) => JSON.parse(String(init?.body)) as Record<string, unknown>);
}

describe("MoleculeEditorTab changed chemistry", () => {
  installMoleculeEditorTestHarness();

  it("shows the before and after InChI, formula and stereocentres when the molecule changed", async () => {
    compareInchiMock.mockReturnValue({
      match: false,
      inchiOriginal: BEFORE_INCHI,
      inchiEdited: AFTER_INCHI,
    });
    seedExampleSubstance();
    stubOverrideFetch();
    await openExampleWithEdit();

    const panel = await screen.findByRole("region", { name: "Changed chemistry" });
    expect(within(panel).getByText(BEFORE_INCHI)).toBeInTheDocument();
    expect(within(panel).getByText(AFTER_INCHI)).toBeInTheDocument();
    expect(within(panel).getAllByText("C10H15N")).toHaveLength(2);
    expect(within(panel).getByText("1 (t9-/m0/s1)")).toBeInTheDocument();
    expect(within(panel).getByText("1 (t9-/m1/s1)")).toBeInTheDocument();
  });

  it("keeps Publish disabled until the substance name is typed, then sends the loaded revision", async () => {
    compareInchiMock.mockReturnValue({
      match: false,
      inchiOriginal: BEFORE_INCHI,
      inchiEdited: AFTER_INCHI,
    });
    seedExampleSubstance();
    const fetchSpy = stubOverrideFetch();
    const user = await openExampleWithEdit();

    const publish = await screen.findByRole("button", { name: "Publish changed chemistry" });
    expect(publish).toBeDisabled();
    const confirmName = screen.getByRole("textbox", { name: /Type Example to publish/ });
    await user.type(confirmName, "Exampl");
    expect(publish).toBeDisabled();
    await user.type(confirmName, "e");
    expect(publish).toBeEnabled();

    await user.click(publish);
    await waitFor(() => expect(saveBodies(fetchSpy)).toHaveLength(1));
    expect(saveBodies(fetchSpy)[0]).toMatchObject({
      slug: "example",
      molblock: "rotated molblock",
      expectedUpdatedAt: SAVED_REVISION,
    });
  });

  it("sends the loaded revision with an unchanged-chemistry save", async () => {
    compareInchiMock.mockReturnValue({ match: true, inchiOriginal: BEFORE_INCHI, inchiEdited: BEFORE_INCHI });
    seedExampleSubstance();
    const fetchSpy = stubOverrideFetch();
    const user = await openExampleWithEdit();

    expect(screen.queryByRole("region", { name: "Changed chemistry" })).not.toBeInTheDocument();
    const save = await screen.findByRole("button", { name: "Save depiction" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);
    await waitFor(() => expect(saveBodies(fetchSpy)).toHaveLength(1));
    expect(saveBodies(fetchSpy)[0]).toMatchObject({ expectedUpdatedAt: SAVED_REVISION });
  });

  it("reports a conflict and keeps the edit when someone saved first", async () => {
    compareInchiMock.mockReturnValue({ match: true, inchiOriginal: BEFORE_INCHI, inchiEdited: BEFORE_INCHI });
    seedExampleSubstance();
    const fetchSpy = stubOverrideFetch();
    const serve = fetchSpy.getMockImplementation();
    fetchSpy.mockImplementation((input, init) => {
      if (String(input) === "/api/dev/molecule-override" && init?.method === "POST") {
        return Promise.resolve(
          Response.json(
            {
              error: "Someone saved this depiction after you opened it. Reload it to see their version before saving.",
              conflict: { updatedAt: "2026-09-01T00:00:00.000Z", updatedBy: "OTHER" },
            },
            { status: 409 },
          ),
        );
      }
      return serve!(input, init);
    });
    const user = await openExampleWithEdit();

    const save = await screen.findByRole("button", { name: "Save depiction" });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    expect(await screen.findByText("Someone saved first")).toBeInTheDocument();
    expect(screen.getByText(/OTHER saved this depiction/)).toBeInTheDocument();
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });
});
