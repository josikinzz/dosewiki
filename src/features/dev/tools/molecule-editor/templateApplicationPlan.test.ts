// @vitest-environment node
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";
import initRDKitModule, { type RDKitModule } from "@rdkit/rdkit";
import * as OCL from "openchemlib";

import { renderMoleculeSvg } from "@/features/dev/tools/molecule-editor/renderMoleculeSvg";
import { smilesToMolblock } from "@/features/dev/tools/molecule-editor/smilesToMolblock";
import {
  buildTemplateApplicationPlan,
  flattenBondOrders,
  restoreBondOrders,
  type TemplateApplicationMember,
  type TemplateApplicationRdkitModule,
} from "@/features/dev/tools/molecule-editor/templateApplicationPlan";

// A deliberately stereo-unspecified parent morphinan, so the fixture contains
// both levo and dextro real-world members of the same rigid scaffold.
const MORPHINAN_SMILES = "C1CCC23CCNC(C2C1)CC4=CC=CC=C34";
const MDMA_SMILES = "CNC(C)CC1=CC2=C(OCO2)C=C1";
// Levorphanol with a Δ-double bond in the carbocyclic ring — the codeine
// pattern: same morphinan framework, one extra unsaturation, so the strict
// (bond-order-exact) template match fails and only the relaxed pass can align.
const DIDEHYDRO_LEVORPHANOL_SMILES = "CN1CC[C@]23C=CCC[C@H]2[C@H]1CC4=C3C=C(C=C4)O";

const MORPHINAN_MEMBERS = [
  {
    slug: "levorphanol",
    smiles: "CN1CC[C@]23CCCC[C@H]2[C@H]1CC4=C3C=C(C=C4)O",
  },
  {
    slug: "levomethorphan",
    smiles: "CN1CC[C@]23CCCC[C@H]2[C@H]1CC4=C3C=C(C=C4)OC",
  },
  {
    slug: "dextrorphan",
    smiles: "CN1CC[C@@]23CCCC[C@@H]2[C@@H]1CC4=C3C=C(C=C4)O",
  },
  {
    slug: "dextromethorphan",
    smiles: "CN1CC[C@@]23CCCC[C@@H]2[C@@H]1CC4=C3C=C(C=C4)OC",
  },
] as const;

let rdkit: RDKitModule;
let templateMolblock: string;
let morphinanMembers: TemplateApplicationMember[];
let mdmaMolblock: string;
let didehydroMolblock: string;

async function molblockFor(smiles: string): Promise<string> {
  const molblock = await smilesToMolblock(smiles);
  if (!molblock) throw new Error(`Could not create baseline MOL block for ${smiles}`);
  return molblock;
}

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const wasmPath = require.resolve("@rdkit/rdkit/dist/RDKit_minimal.wasm");
  const init = initRDKitModule as unknown as (options?: {
    locateFile?: () => string;
  }) => Promise<RDKitModule>;
  rdkit = await init({ locateFile: () => wasmPath });

  templateMolblock = await molblockFor(MORPHINAN_SMILES);
  morphinanMembers = await Promise.all(
    MORPHINAN_MEMBERS.map(async ({ slug, smiles }) => ({
      slug,
      molblock: await molblockFor(smiles),
      source: "seeded" as const,
    })),
  );
  mdmaMolblock = await molblockFor(MDMA_SMILES);
  didehydroMolblock = await molblockFor(DIDEHYDRO_LEVORPHANOL_SMILES);
}, 30_000);

function atomCoordinates(molblock: string): Array<[number, number]> {
  const lines = molblock.split(/\r?\n/);
  const atomCount = Number.parseInt(lines[3]?.slice(0, 3) ?? "", 10);
  if (!Number.isFinite(atomCount)) throw new Error("Expected a V2000 MOL block.");
  return lines.slice(4, 4 + atomCount).map((line) => [
    Number.parseFloat(line.slice(0, 10)),
    Number.parseFloat(line.slice(10, 20)),
  ]);
}

function matchedCoreDistances(templateMolblock: string, alignedMolblock: string): number[] {
  const template = rdkit.get_mol(templateMolblock);
  const aligned = rdkit.get_mol(alignedMolblock);
  if (!template || !aligned) throw new Error("Expected parseable template and aligned MOL blocks.");

  try {
    const match = JSON.parse(aligned.get_substruct_match(template)) as { atoms?: number[] };
    if (!match.atoms?.length) throw new Error("Expected aligned MOL block to match the template.");
    const templateCoordinates = atomCoordinates(template.get_molblock());
    const alignedCoordinates = atomCoordinates(aligned.get_molblock());
    return match.atoms.map((memberAtom, templateAtom) => {
      const [memberX, memberY] = alignedCoordinates[memberAtom];
      const [templateX, templateY] = templateCoordinates[templateAtom];
      return Math.hypot(memberX - templateX, memberY - templateY);
    });
  } finally {
    template.delete();
    aligned.delete();
  }
}

describe("flattenBondOrders / restoreBondOrders", () => {
  it("round-trips bond orders through a flatten + restore", () => {
    const flattened = flattenBondOrders(mdmaMolblock);
    expect(flattened).not.toBe(mdmaMolblock);
    // flattened copy has no double bonds left in the bond block
    const doubles = flattened
      .split(/\r?\n/)
      .filter((line) => /^\s*\d+\s+\d+\s+2\s/.test(` ${line}`)).length;
    expect(doubles).toBe(0);
    // restoring against the original brings every order back
    expect(restoreBondOrders(flattened, mdmaMolblock)).toBe(mdmaMolblock);
  });

  it("returns null when the bond sets don't line up", () => {
    expect(restoreBondOrders(mdmaMolblock, templateMolblock)).toBeNull();
  });
});

describe("buildTemplateApplicationPlan", () => {
  it("aligns true morphinan matches while preserving the template's mapped core coordinates", () => {
    const plan = buildTemplateApplicationPlan(
      rdkit as unknown as TemplateApplicationRdkitModule,
      templateMolblock,
      morphinanMembers,
    );

    expect(plan).toHaveLength(MORPHINAN_MEMBERS.length);
    for (const result of plan) {
      expect(result.outcome).toBe("aligned");
      if (result.outcome !== "aligned") continue;
      expect(result.molblock).not.toBe("");
      for (const distance of matchedCoreDistances(templateMolblock, result.molblock)) {
        expect(distance).toBeLessThan(0.001);
      }
    }
  });

  it("reports non-matches, protects hand edits without parsing them, and contains member errors", () => {
    const editorMolblock = "editor molblock must never be parsed";
    let editorMolblockRequested = false;
    const observedRdkit: TemplateApplicationRdkitModule = {
      get_mol(input) {
        if (input === editorMolblock) editorMolblockRequested = true;
        return rdkit.get_mol(input) as unknown as ReturnType<TemplateApplicationRdkitModule["get_mol"]>;
      },
    };
    const input = [
      { slug: "mdma", molblock: mdmaMolblock, source: "seeded" as const },
      { slug: "editor-row", molblock: editorMolblock, source: "editor" as const },
      // Rows predating the source marker (pre-unification hand edits) have
      // unknown provenance and must be protected exactly like editor rows.
      { slug: "legacy-row", molblock: editorMolblock, source: undefined },
      { slug: "garbage", molblock: "definitely not a molblock", source: "template" as const },
    ];

    expect(buildTemplateApplicationPlan(observedRdkit, templateMolblock, input)).toEqual([
      { slug: "mdma", outcome: "no-match" },
      { slug: "editor-row", outcome: "protected-hand-edit" },
      { slug: "legacy-row", outcome: "protected-hand-edit" },
      {
        slug: "garbage",
        outcome: "error",
        reason: "Member MOL block could not be parsed.",
      },
    ]);
    expect(editorMolblockRequested).toBe(false);
  });

  it("aligns an unsaturated skeleton variant through the relaxed bond pass without changing the molecule", () => {
    const [result] = buildTemplateApplicationPlan(
      rdkit as unknown as TemplateApplicationRdkitModule,
      templateMolblock,
      [{ slug: "didehydro-levorphanol", molblock: didehydroMolblock, source: "seeded" }],
    );

    expect(result.outcome).toBe("aligned");
    if (result.outcome !== "aligned") return;
    expect(result.relaxedBonds).toBe(true);

    // The relaxation moved the drawing, not the chemistry.
    const before = rdkit.get_mol(didehydroMolblock);
    const after = rdkit.get_mol(result.molblock);
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after!.get_smiles()).toBe(before!.get_smiles());
    before!.delete();
    after!.delete();
  });

  it("marks exact-bond matches as strictly aligned, not relaxed", () => {
    const [result] = buildTemplateApplicationPlan(
      rdkit as unknown as TemplateApplicationRdkitModule,
      templateMolblock,
      [morphinanMembers[0]],
    );
    expect(result.outcome).toBe("aligned");
    if (result.outcome !== "aligned") return;
    expect(result.relaxedBonds).toBeUndefined();
  });

  it("renders every aligned morphinan fixture on the brand engine before and after alignment", () => {
    const plan = buildTemplateApplicationPlan(
      rdkit as unknown as TemplateApplicationRdkitModule,
      templateMolblock,
      morphinanMembers,
    );

    for (const member of morphinanMembers) {
      const result = plan.find((item) => item.slug === member.slug);
      expect(result?.outcome).toBe("aligned");
      if (!result || result.outcome !== "aligned") continue;
      expect(renderMoleculeSvg(OCL, member.molblock)).not.toBeNull();
      const after = renderMoleculeSvg(OCL, result.molblock);
      expect(after).toContain("<svg");
      // every CPK color is mapped onto the brand palette
      expect(after).not.toContain("rgb(0,0,0)");
    }
  });
});
