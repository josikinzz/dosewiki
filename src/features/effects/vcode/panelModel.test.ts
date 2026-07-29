import { describe, expect, it } from "vitest";

import { normalizeVCodeContent } from "./normalize";
import { countVCodePanelRows, extractVCodePanelSections } from "./panelModel";
import type { VCodeNode } from "./types";

/** Parse a `[panel]` exactly as the renderer receives it, then read its children. */
function panelChildren(raw: string): (string | VCodeNode)[] {
  const normalized = normalizeVCodeContent(raw, undefined);
  const nodes = (Array.isArray(normalized) ? normalized : [normalized]) as (
    | string
    | VCodeNode
  )[];
  const panel = nodes.find(
    (node): node is VCodeNode => typeof node !== "string" && node?.name === "panel",
  );

  if (!panel) {
    throw new Error("fixture did not parse to a panel");
  }

  return panel.children;
}

const EFFECT_ROW = `[li][b][int-link to="/effects/anxiety-suppression"]Anxiety suppression[/int-link][/b] [sup](common)[/sup][/li]`;

describe("extractVCodePanelSections", () => {
  it("reads a plain list of effect links as one untitled section", () => {
    const sections = extractVCodePanelSections(
      panelChildren(
        `[panel title="Cognitive" icon="user.svg"][ul]
${EFFECT_ROW}
[li][b][int-link to="/effects/conceptual-thinking"]Conceptual thinking[/int-link][/b][/li]
[/ul][/panel]`,
      ),
    );

    expect(sections).toEqual([
      {
        rows: [
          {
            label: "Anxiety suppression",
            href: "/effects/anxiety-suppression",
            meta: "(common)",
          },
          { label: "Conceptual thinking", href: "/effects/conceptual-thinking" },
        ],
      },
    ]);
  });

  it("groups the DMT article's frequency headings into linked sections", () => {
    const sections = extractVCodePanelSections(
      panelChildren(
        `[panel title="Visual" icon="eye.svg"][h3][int-link to="/articles/approximate-frequency-of-occurrence-scale"]near universal[/int-link][/h3]
[ul][li][b][int-link to="/effects/colour-enhancement"]Colour enhancement[/int-link][/b][/li][/ul]
[h3][int-link to="/articles/approximate-frequency-of-occurrence-scale"]frequent[/int-link][/h3]
[ul][li][b][int-link to="/effects/drifting"]Drifting[/int-link][/b] [sup](level 3-4)[/sup][/li][/ul][/panel]`,
      ),
    );

    expect(sections).toHaveLength(2);
    expect(sections?.[0]).toMatchObject({
      title: "near universal",
      titleHref: "/articles/approximate-frequency-of-occurrence-scale",
    });
    expect(sections?.[1].rows).toEqual([
      { label: "Drifting", href: "/effects/drifting", meta: "(level 3-4)" },
    ]);
    expect(countVCodePanelRows(sections ?? [])).toBe(2);
  });

  it("hangs a nested list off the row it qualifies", () => {
    const sections = extractVCodePanelSections(
      panelChildren(
        `[panel title="Other" icon="cogs.svg"][ul]
[li][b][int-link to="/effects/nausea"]Nausea[/int-link][/b] [sup](frequent)[/sup][/li]
[ul][li][b][int-link to="/effects/nausea?s=vomiting"]Vomiting[/int-link][/b] [sup](common)[/sup][/li][/ul]
[li][b][int-link to="/effects/synaesthesia"]Synaesthesia[/int-link][/b] [sup](rare)[/sup][/li]
[/ul][/panel]`,
      ),
    );

    expect(sections).toHaveLength(1);
    expect(sections?.[0].rows.map((row) => row.label)).toEqual(["Nausea", "Synaesthesia"]);
    expect(sections?.[0].rows[0].children).toEqual([
      { label: "Vomiting", href: "/effects/nausea?s=vomiting", meta: "(common)" },
    ]);
    // The count is what the panel lists, sub-effects included.
    expect(countVCodePanelRows(sections ?? [])).toBe(3);
  });

  it("recovers a section heading stranded inside an unclosed list", () => {
    // The DMT article omits a `[/ul]`, so its next heading parses as a child of
    // the list it was meant to follow.
    const sections = extractVCodePanelSections(
      panelChildren(
        `[panel title="Cognitive" icon="user.svg"][ul]
[li][b][int-link to="/effects/wakefulness"]Wakefulness[/int-link][/b][/li]
[h3][int-link to="/articles/approximate-frequency-of-occurrence-scale"]common[/int-link][/h3]
[/ul]
[ul][li][b][int-link to="/effects/analysis-suppression"]Analysis suppression[/int-link][/b][/li][/ul][/panel]`,
      ),
    );

    expect(sections).toHaveLength(2);
    expect(sections?.[0]).toEqual({
      rows: [{ label: "Wakefulness", href: "/effects/wakefulness" }],
    });
    expect(sections?.[1]).toMatchObject({
      title: "common",
      rows: [{ label: "Analysis suppression", href: "/effects/analysis-suppression" }],
    });
  });

  it("declines a sub-list nested deeper than one level", () => {
    expect(
      extractVCodePanelSections(
        panelChildren(
          `[panel title="Other"][ul][li][b][int-link to="/effects/nausea"]Nausea[/int-link][/b][/li]
[ul][li][b][int-link to="/effects/nausea?s=vomiting"]Vomiting[/int-link][/b][/li]
[ul][li][b][int-link to="/effects/nausea?s=retching"]Retching[/int-link][/b][/li][/ul][/ul][/ul][/panel]`,
        ),
      ),
    ).toBeNull();
  });

  it("declines a panel holding prose, so nothing is dropped in conversion", () => {
    expect(
      extractVCodePanelSections(
        panelChildren(
          `[panel title="Visual"][p]These effects build on one another.[/p][ul]${EFFECT_ROW}[/ul][/panel]`,
        ),
      ),
    ).toBeNull();
  });

  it("declines a list item that is more than a link and its qualifier", () => {
    expect(
      extractVCodePanelSections(
        panelChildren(
          `[panel title="Visual"][ul][li]Increasingly intense [int-link to="/effects/drifting"]drifting[/int-link], which builds.[/li][/ul][/panel]`,
        ),
      ),
    ).toBeNull();
  });

  it("declines an outbound link, which an index row has no rel slot for", () => {
    expect(
      extractVCodePanelSections(
        panelChildren(
          `[panel title="See also"][ul][li][ext-link to="https://en.wikipedia.org/wiki/Dream"]Dream[/ext-link][/li][/ul][/panel]`,
        ),
      ),
    ).toBeNull();
  });

  it("declines a heading with no list under it", () => {
    expect(
      extractVCodePanelSections(
        panelChildren(`[panel title="Visual"][h3]frequent[/h3][/panel]`),
      ),
    ).toBeNull();
  });

  it("declines an empty panel", () => {
    expect(extractVCodePanelSections(panelChildren(`[panel title="Visual"][/panel]`))).toBeNull();
  });
});
