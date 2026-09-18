import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  EditorTable,
  EditorTableBody,
  EditorTableCell,
  EditorTableHead,
  EditorTableHeading,
  EditorTableRow,
} from "./EditorTable";

/**
 * The one-DOM-two-layouts contract: table semantics survive the card layout,
 * and a labelled cell carries its column name so a phone reader, where the
 * header row is hidden, still knows what the value is.
 */
describe("EditorTable", () => {
  it("keeps table semantics and labels cells with their column name", () => {
    render(
      <EditorTable>
        <EditorTableHead>
          <EditorTableHeading>Name</EditorTableHeading>
          <EditorTableHeading>Role</EditorTableHeading>
        </EditorTableHead>
        <EditorTableBody>
          <EditorTableRow>
            <EditorTableCell label="Name">Ada</EditorTableCell>
            <EditorTableCell label="Role" wide>
              <button type="button">Ban</button>
            </EditorTableCell>
          </EditorTableRow>
        </EditorTableBody>
      </EditorTable>,
    );

    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Name", "Role"]);

    const [row] = within(table).getAllByRole("rowgroup")[1].querySelectorAll("tr");
    expect(within(row).getByRole("cell", { name: /^Name\s*Ada$/ })).toBeInTheDocument();
    expect(within(within(row).getByRole("cell", { name: /^Role/ })).getByRole("button", { name: "Ban" })).toBeEnabled();
  });

  it("renders an unlabelled cell as its bare value", () => {
    render(
      <EditorTable>
        <EditorTableBody>
          <EditorTableRow>
            <EditorTableCell>plain</EditorTableCell>
          </EditorTableRow>
        </EditorTableBody>
      </EditorTable>,
    );
    expect(screen.getByRole("cell", { name: "plain" })).toBeInTheDocument();
  });
});
