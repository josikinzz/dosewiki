import { describe, expect, it } from "vitest";

import { repairMarkdownShortcodeBody } from "./markdownShortcodeRepair.mjs";
import { parseRawVCodeContent } from "../../src/features/effects/vcode/normalize";

/** The exact damage shape the legacy import left on `dxm`. */
const HOISTED_ROUNDUP =
  '[int-link to="/effectsauditory-suppression"]markdown text="#### Sensory* [**Auditory suppression**[/int-link] <sup>(common)</sup>* [int-link to="/effectstracers"]**Tracers**[/int-link] <sup>(level 1-2 / common)</sup>" /]';

describe("repairMarkdownShortcodeBody", () => {
  it("turns a hoisted effect roundup into a titled panel of effect rows", () => {
    const { body, panels } = repairMarkdownShortcodeBody(HOISTED_ROUNDUP);

    expect(panels).toBe(1);
    expect(body).toContain('[panel title="Sensory" icon="eye.svg"]');
    expect(body).toContain(
      '[li][b][int-link to="/effectsauditory-suppression"]Auditory suppression[/int-link][/b] [sup](common)[/sup][/li]',
    );
    expect(body).toContain(
      '[li][b][int-link to="/effectstracers"]Tracers[/int-link][/b] [sup](level 1-2 / common)[/sup][/li]',
    );
    expect(body).not.toContain("markdown text=");
    expect(body).not.toContain("**");
  });

  it("lays adjacent roundups out as one row of columns", () => {
    const { body } = repairMarkdownShortcodeBody(
      `${HOISTED_ROUNDUP}[int-link to="/effectsanxiety-suppression"]markdown text="#### Cognitive* [**Anxiety suppression**[/int-link] <sup>(common)</sup>" /]`,
    );

    expect(body.match(/\[columns\]/g)).toHaveLength(1);
    expect(body.match(/\[panel /g)).toHaveLength(2);
    // Three column slots per row, the layout the hand-written articles use.
    expect(body.match(/\[column\]/g)).toHaveLength(3);
  });

  it("nests a `?s=` variation under the effect it varies", () => {
    const { body } = repairMarkdownShortcodeBody(
      '[markdown text="#### Physical* [int-link to="/effectsnausea"]**Nausea**[/int-link] <sup>(frequent)</sup>* [int-link to="/effectsnausea?s=vomiting"]**Vomiting**[/int-link] <sup>(common)</sup>" /]',
    );

    expect(body).toContain(
      '[ul]\n[li][b][int-link to="/effectsnausea?s=vomiting"]Vomiting[/int-link][/b] [sup](common)[/sup][/li]\n[/ul]',
    );
  });

  it("keeps consecutive variations together in a renderable index panel", () => {
    const { body } = repairMarkdownShortcodeBody(
      '[markdown text="#### Sensory* [int-link to="/effectsvisual-disconnection"]**Visual disconnection**[/int-link] <sup>(frequent)</sup>* [int-link to="/effectsvisual-disconnection?s=holes"]**Holes**[/int-link] <sup>(common)</sup>* [int-link to="/effectsvisual-disconnection?s=structures"]**Structures**[/int-link] <sup>(rare)</sup>" /]',
    );
    const columns = parseRawVCodeContent(body);
    const panel = columns.children.find((node) => node.name === "column")
      .children.find((node) => node.name === "panel");
    const list = panel.children.find((node) => node.name === "ul");
    const sublists = list.children.filter((node) => node.name === "ul");
    expect(sublists).toHaveLength(1);
    expect(sublists[0].children.filter((node) => node.name === "li")
      .map((node) => node.children[0].children[0].children[0]))
      .toEqual(["Holes", "Structures"]);
  });

  it("groups an unheaded roundup by the categories the article assigns elsewhere", () => {
    const { body } = repairMarkdownShortcodeBody(
      '[markdown text="* [int-link to="/effectsstimulation"]**Stimulation**[/int-link] <sup>(frequent)</sup>* [int-link to="/effectsanxiety-suppression"]**Anxiety suppression**[/int-link] <sup>(common)</sup>" /]' +
        `\n${HOISTED_ROUNDUP}[int-link to="/effectsanxiety-suppression"]markdown text="#### Cognitive* [**Anxiety suppression**[/int-link] <sup>(common)</sup>* [int-link to="/effectsstimulation"]**Stimulation**[/int-link] <sup>(frequent)</sup>" /]`,
    );

    const firstBlock = body.split("[columns]")[1];
    expect(firstBlock).toContain('[panel title="Cognitive" icon="user.svg"]');
    expect(firstBlock).toContain("Stimulation");
    expect(firstBlock).toContain("Anxiety suppression");
  });

  it("rewrites the duration block as a plain list", () => {
    const { body } = repairMarkdownShortcodeBody(
      '[markdown text="**Total :** 8 - 12 hours* \n**Onset :** 30 - 120 minutes" /]',
    );

    expect(body).toBe(
      "[ul]\n[li][b]Total :[/b] 8 - 12 hours[/li]\n[li][b]Onset :[/b] 30 - 120 minutes[/li]\n[/ul]",
    );
  });

  it("keeps prose emphasis in a non-effect list", () => {
    const { body } = repairMarkdownShortcodeBody(
      '[int-link to="/reports/re-discovering-dxm"]markdown text="- [**Re-discovering DXM**[/int-link] by [int-link to="/profiles/Josie"]*Josie Kins*[/int-link]- [int-link to="/reports/heavy-dose-of-cough-syrup"]**Heavy dose of cough syrup**[/int-link] by *Gabriel*" /]',
    );

    expect(body).toBe(
      "[ul]\n" +
        '[li][int-link to="/reports/re-discovering-dxm"][b]Re-discovering DXM[/b][/int-link] by [int-link to="/profiles/Josie"][i]Josie Kins[/i][/int-link][/li]\n' +
        '[li][int-link to="/reports/heavy-dose-of-cough-syrup"][b]Heavy dose of cough syrup[/b][/int-link] by [i]Gabriel[/i][/li]\n' +
        "[/ul]",
    );
  });

  it("leaves the markup around a blob untouched", () => {
    const { body } = repairMarkdownShortcodeBody(
      `[p]Before.[/p]\n\n${HOISTED_ROUNDUP}\n\n[p]After.[/p]`,
    );

    expect(body.startsWith("[p]Before.[/p]\n\n[columns]")).toBe(true);
    expect(body.endsWith("[/columns]\n\n[p]After.[/p]")).toBe(true);
  });

  it("keeps a list's lead-in label out of the list and links its rows", () => {
    const { body } = repairMarkdownShortcodeBody(
      '[markdown text="**Secular meditative techniques**\n\n- [Mindfulness meditation](https://en.wikipedia.org/wiki/Mindfulness)\n- Transcendental meditation" /]',
    );

    expect(body).toBe(
      "[p][b]Secular meditative techniques[/b][/p]\n\n[ul]\n" +
        '[li][ext-link to="https://en.wikipedia.org/wiki/Mindfulness"]Mindfulness meditation[/ext-link][/li]\n' +
        "[li]Transcendental meditation[/li]\n[/ul]",
    );
  });

  it("renders a heading-only blob as a heading", () => {
    expect(repairMarkdownShortcodeBody('[markdown text="### Regular usage" /]').body).toBe(
      "[h3]Regular usage[/h3]",
    );
  });

  it("refuses a blob it cannot recognise rather than dropping content", () => {
    expect(() => repairMarkdownShortcodeBody('[markdown text="unterminated')).toThrow(
      /Unterminated markdown shortcode/,
    );
  });
});
