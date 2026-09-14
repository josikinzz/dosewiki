import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import {
  parseOclCustomLabelSgroups,
  stripOclCustomLabelSgroups,
} from "./applyRLabelsToMolblock";
import {
  OCL_BENZENE,
  OCL_BENZENE_WITH_SURVIVOR_RAW,
  OCL_TYPED_R_EMISSION_RAW,
  RDKIT_PHENETHYLAMINE,
} from "./classMolblockFixture";

const mocks = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useDrainedReadMock: vi.fn(),
  useSubstanceLookupMock: vi.fn(),
  useRdkitMock: vi.fn(),
  useOclMock: vi.fn(),
  renderMoleculeSvgMock: vi.fn(),
  smilesToMolblockMock: vi.fn(),
  compareInchiMock: vi.fn(),
  compareCanonicalSmilesMock: vi.fn(),
}));

export const {
  useQueryMock,
  useDrainedReadMock,
  useSubstanceLookupMock,
  useRdkitMock,
  useOclMock,
  renderMoleculeSvgMock,
  smilesToMolblockMock,
  compareInchiMock,
  compareCanonicalSmilesMock,
} = mocks;

Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value: vi.fn(),
});

vi.mock("@/hooks/useEditorRead", () => ({
  useEditorRead: useQueryMock,
  useEditorDrainedRead: useDrainedReadMock,
  useInvalidateEditorReads: () => async () => undefined,
}));
vi.mock("@/hooks/useSubstanceLookup", () => ({
  useSubstanceLookup: useSubstanceLookupMock,
}));
vi.mock("./useRdkit", () => ({ useRdkit: useRdkitMock }));
vi.mock("./useOcl", () => ({ useOcl: useOclMock }));
vi.mock("./renderMoleculeSvg", () => ({ renderMoleculeSvg: renderMoleculeSvgMock }));
vi.mock("./smilesToMolblock", () => ({ smilesToMolblock: smilesToMolblockMock }));
vi.mock("./stereoGuard", () => ({
  compareInchi: compareInchiMock,
  compareCanonicalSmiles: compareCanonicalSmilesMock,
}));
vi.mock("./OclEditor", () => ({
  OclEditor: ({
    source,
    atomLabels,
    fineRotation,
    mirrorDirection,
    snapRequest,
    bondPickActive,
    onChange,
    onMirrorComplete,
    onSnapComplete,
    onSelectedBondCountChange,
    onBondPickComplete,
  }: {
    source: string | null;
    atomLabels?: Record<number, string>;
    fineRotation?: boolean;
    mirrorDirection?: string | null;
    snapRequest?: string | null;
    bondPickActive?: boolean;
    onChange: (molblock: string, displayedAtomLabels?: Record<number, string>) => void;
    onMirrorComplete?: () => void;
    onSnapComplete?: (outcome: {
      kind: "bond-vertical" | "straighten";
      status: "applied";
      degrees: number;
    }) => void;
    onSelectedBondCountChange?: (count: number) => void;
    onBondPickComplete?: (outcome: {
      kind: "bond-vertical";
      status: "applied" | "canceled";
      degrees?: number;
    }) => void;
  }) => (
    <div
      data-testid="ocl-editor"
      data-source={source ?? ""}
      data-atom-labels={atomLabels ? JSON.stringify(atomLabels) : ""}
      data-fine-rotation={String(fineRotation)}
      data-mirror-direction={mirrorDirection ?? ""}
      data-snap-request={snapRequest ?? ""}
      data-bond-pick={String(!!bondPickActive)}
    >
      <button type="button" onClick={onMirrorComplete}>Complete mirror request</button>
      {/* Emissions mirror OclEditor's emitMolfile: stripped molblock + the
          labels OCL currently displays, parsed off the raw emission. */}
      <button type="button" onClick={() => onChange("rotated molblock", {})}>Emit rotation</button>
      <button type="button" onClick={() => onChange(OCL_BENZENE, parseOclCustomLabelSgroups(OCL_BENZENE))}>
        Emit benzene redraw
      </button>
      <button
        type="button"
        onClick={() =>
          onChange(
            stripOclCustomLabelSgroups(OCL_BENZENE_WITH_SURVIVOR_RAW),
            parseOclCustomLabelSgroups(OCL_BENZENE_WITH_SURVIVOR_RAW),
          )
        }
      >
        Emit partial redraw
      </button>
      <button
        type="button"
        onClick={() =>
          onChange(
            stripOclCustomLabelSgroups(OCL_TYPED_R_EMISSION_RAW),
            parseOclCustomLabelSgroups(OCL_TYPED_R_EMISSION_RAW),
          )
        }
      >
        Emit typed R groups
      </button>
      <button type="button" onClick={() => onSelectedBondCountChange?.(1)}>Select one bond</button>
      <button type="button" onClick={() => onSelectedBondCountChange?.(2)}>Select two bonds</button>
      <button
        type="button"
        onClick={() => onSnapComplete?.({ kind: "bond-vertical", status: "applied", degrees: 12.34 })}
      >
        Complete snap request
      </button>
      <button
        type="button"
        onClick={() =>
          onBondPickComplete?.({ kind: "bond-vertical", status: "applied", degrees: 12.34 })
        }
      >
        Pick a bond
      </button>
      <button
        type="button"
        onClick={() => onBondPickComplete?.({ kind: "bond-vertical", status: "canceled" })}
      >
        Cancel pick from canvas
      </button>
    </div>
  ),
}));

export function installMoleculeEditorTestHarness() {
  beforeEach(() => {
    useDrainedReadMock.mockReturnValue({
      results: [],
      status: "Exhausted",
    });
    useSubstanceLookupMock.mockReturnValue({
      lookup: [],
      isLoading: false,
      status: "Exhausted",
    });
    useRdkitMock.mockReturnValue({ rdkit: null, error: null });
    // A functional identity stub, not null: the tab installs baselines through
    // `normalizeForComparison` (ocl.Molecule.fromMolfile(m).toMolfile()) and
    // waits for OCL before resolving any source, so a null default would keep
    // the canvas in "Computing" forever. Identity keeps molblock fixtures
    // (e.g. "saved molblock") byte-intact for `data-source` assertions.
    useOclMock.mockReturnValue({
      ocl: { Molecule: { fromMolfile: (molblock: string) => ({ toMolfile: () => molblock }) } },
      error: null,
    });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useQueryMock.mockReset();
    useDrainedReadMock.mockReset();
    useSubstanceLookupMock.mockReset();
    useRdkitMock.mockReset();
    useOclMock.mockReset();
    renderMoleculeSvgMock.mockReset();
    smilesToMolblockMock.mockReset();
    compareInchiMock.mockReset();
    compareCanonicalSmilesMock.mockReset();
  });
}

/** Lookup with one substance, its saved-override listing, and a CCO article. */
export function seedExampleSubstance() {
  useSubstanceLookupMock.mockReturnValue({
    lookup: [{ slug: "example", name: "Example" }],
    isLoading: false,
    status: "Exhausted",
  });
  useQueryMock.mockImplementation((query, args) => {
    if (query === "moleculeOverrides:listSlugs") return [{ slug: "example" }];
    if (query === "substanceIndex:getBySlug") {
      // A new-but-equal object every call, like a refetch that changed the row.
      return args === "skip" ? undefined : { identification: { smiles: "CCO" } };
    }
    return undefined;
  });
}

const SAVED_EXAMPLE_OVERRIDE = {
  slug: "example",
  molblock: "saved molblock",
  svg: "<svg />",
  updatedAt: "2026-07-12T00:00:00.000Z",
}

/** GET /api/dev/molecule-override answers with `override` (null = no saved depiction). */
export function stubOverrideFetch(override: Record<string, unknown> | null = SAVED_EXAMPLE_OVERRIDE) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ ok: true, override }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** Seeded-class flow: no saved override, RDKit generates the Markush molblock. */
export function seedPhenethylamineClass() {
  useRdkitMock.mockReturnValue({
    rdkit: { get_mol: () => ({ get_molblock: () => RDKIT_PHENETHYLAMINE, delete: () => {} }) },
    error: null,
  });
  renderMoleculeSvgMock.mockReturnValue("<svg />");
  useQueryMock.mockReturnValue(undefined);
  stubOverrideFetch(null);
}
