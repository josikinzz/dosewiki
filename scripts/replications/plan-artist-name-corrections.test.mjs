import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  loadArtistNameCorrections,
  planArtistNameCorrections,
  planRowCorrection,
  planSlugConsequences,
  retextCreditField,
} from "./plan-artist-name-corrections.mjs";

/** Shapes and values lifted from the live production rows. */
const BEN = {
  _id: "k579br1typkrtmhgw8g06r08px8bctt1",
  slug: "continuum-infinitum-ben-ridgeway",
  effect_slug: "geometry",
  title: "Continuum Infinitum",
  artist: "Ben Ridgeway",
  artist_url: "https://vimeo.com/41806282",
  credit_line: "Continuum Infinitum by Ben Ridgeway",
  source_url: "https://streamable.com/e/4tiz4u",
  rightsholder: "Ben Ridgeway",
};

const SAM = {
  _id: "k57bfakf3vrf07v8m4h0y4pwf5846264",
  slug: "switch-sam-perkins",
  effect_slug: "geometry",
  title: "Switch",
  artist: "Sam perkins",
  artist_url: "https://www.flickr.com/photos/thecubb/5132746341/",
  credit_line: "Switch by Sam perkins",
  source_url: "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev/switch%20by%20sam%20perkins.png",
  rightsholder: "Sam perkins",
};

const MORACZ = {
  _id: "k578t93j4tx13bw5r9wm0pf5kx8466qc",
  slug: "hatheg-kla-moracs",
  effect_slug: "unspeakable-horrors",
  title: "Hatheg-Kla",
  artist: "MOracs",
  artist_url: "http://waruzimu.deviantart.com/art/Hatheg-Kla-220753288",
  credit_line: "Hatheg-Kla by MOracs",
  source_url: "https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev/Hatheg-Kla_by_MOracz.jpg",
  rightsholder: "MOracs",
};

/** A Reddit-archive row from the 2026-08-30 campaign: the credit line carries the submitter snapshot. */
const STINGRAYZ = {
  _id: "k57cf2s8r3nz0g6y7w0wq2h4c1856m7p",
  slug: "this-friendly-stingrayz-says-hi-psychedelic-visuals-gqcvye",
  effect_slug: "geometry",
  title: 'This Friendly Stingrayz Says "Hi!" (Psychedelic Visuals)',
  artist: "StingrayZ",
  artist_url: "https://www.reddit.com/user/StingrayZ/",
  credit_line:
    'This Friendly Stingrayz Says "Hi!" (Psychedelic Visuals) by StingrayZ. Archived from r/replications post gqcvye; submitter snapshot: StingrayZ.',
  source_url: "https://v.redd.it/gqcvye",
  rightsholder: null,
};

const STINGRAYZ_CORRECTION = { stored: "StingrayZ", correct: "Symmetric Vision" };
const BEN_CORRECTION = { stored: "Ben Ridgeway", correct: "Ben Ridgway" };

/**
 * A reviewed corrections file in miniature. The real one lives outside the
 * repository and is handed to the script with `--corrections=<path>`; this one
 * carries each kind of entry the loader must include or leave alone.
 */
const CORRECTIONS_FILE = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "artist-name-corrections-")),
  "corrections.json",
);
fs.writeFileSync(
  CORRECTIONS_FILE,
  JSON.stringify({
    nameCorrections: [
      { ...BEN_CORRECTION, strength: "strong", correctsReplicationArtistField: true },
      { stored: "Simon Haid", correct: "Simon Haiduk", strength: "strong", correctsReplicationArtistField: true },
      { stored: "MOracs", correct: "MOracz", strength: "strong", correctsReplicationArtistField: true },
      { stored: "Sam perkins", correct: "Sam Perkins", strength: "strong", correctsReplicationArtistField: true },
      { ...STINGRAYZ_CORRECTION, strength: "strong", correctsReplicationArtistField: true },
      // Right about the display name, not something to push onto the rows.
      { stored: "Chelsea Morgen", correct: "Chelsea Morgan", strength: "strong", correctsReplicationArtistField: false },
      // Not reviewed to the point of acting on it.
      { stored: "Insedigris", correct: "Insidigris", strength: "weak", correctsReplicationArtistField: true },
    ],
  }),
);
afterAll(() => fs.rmSync(path.dirname(CORRECTIONS_FILE), { recursive: true, force: true }));

const CORRECTIONS = loadArtistNameCorrections(CORRECTIONS_FILE);

describe("loadArtistNameCorrections", () => {
  it("takes only the strong corrections that say they apply to the rows", () => {
    expect(CORRECTIONS.map((entry) => entry.stored)).toEqual([
      "Ben Ridgeway",
      "Simon Haid",
      "MOracs",
      "Sam perkins",
      "StingrayZ",
    ]);
    for (const entry of CORRECTIONS) {
      expect(entry.strength).toBe("strong");
      expect(entry.correctsReplicationArtistField).toBe(true);
    }
  });

  it("narrows to the stored names asked for, matched without regard to case", () => {
    expect(
      loadArtistNameCorrections(CORRECTIONS_FILE, { only: ["stingrayz", "Ben Ridgeway"] }).map((entry) => entry.stored),
    ).toEqual(["Ben Ridgeway", "StingrayZ"]);
  });

  it("refuses a name with no correction on file instead of planning nothing", () => {
    expect(() => loadArtistNameCorrections(CORRECTIONS_FILE, { only: ["StingrayZ", "Stingray"] })).toThrow(
      /No strong artist-name correction on file for: "Stingray"/,
    );
  });

  it("refuses to run without a corrections file rather than planning from none", () => {
    expect(() => loadArtistNameCorrections(undefined)).toThrow(/--corrections=<path>/);
  });
});

describe("retextCreditField", () => {
  it("carries the correction into the free-text credit line", () => {
    expect(retextCreditField("Continuum Infinitum by Ben Ridgeway", "Ben Ridgeway", "Ben Ridgway")).toBe(
      "Continuum Infinitum by Ben Ridgway",
    );
  });

  it("catches a casing-only difference, which is the whole of the Sam Perkins fix", () => {
    expect(retextCreditField("Switch by Sam perkins", "Sam perkins", "Sam Perkins")).toBe(
      "Switch by Sam Perkins",
    );
  });

  it("leaves an absent field absent rather than inventing one", () => {
    expect(retextCreditField(null, "Ben Ridgeway", "Ben Ridgway")).toBeNull();
  });

  it("moves only the credit token of a Reddit-archive line, never the submitter snapshot", () => {
    expect(
      retextCreditField(
        "Staring at the sun on psychedelics by StingrayZ. Archived from r/replications post 6e00jy; submitter snapshot: StingrayZ.",
        "StingrayZ",
        "Symmetric Vision",
      ),
    ).toBe(
      "Staring at the sun on psychedelics by Symmetric Vision. Archived from r/replications post 6e00jy; submitter snapshot: StingrayZ.",
    );
  });

  it("leaves a mention of the handle inside the title as the artist wrote it", () => {
    expect(retextCreditField(STINGRAYZ.credit_line, "StingrayZ", "Symmetric Vision")).toBe(
      'This Friendly Stingrayz Says "Hi!" (Psychedelic Visuals) by Symmetric Vision. Archived from r/replications post gqcvye; submitter snapshot: StingrayZ.',
    );
  });

  it("keeps an upscale note after the credit token", () => {
    expect(
      retextCreditField("Asphalt by Chelsea Morgen. Modified from the original (upscaled).", "Chelsea Morgen", "Chelsea Morgan"),
    ).toBe("Asphalt by Chelsea Morgan. Modified from the original (upscaled).");
  });

  it("replaces a rightsholder only when the whole field is the name", () => {
    expect(retextCreditField("Ben Ridgeway", "Ben Ridgeway", "Ben Ridgway")).toBe("Ben Ridgway");
    expect(retextCreditField("Ben Ridgeway Studio", "Ben Ridgeway", "Ben Ridgway")).toBe("Ben Ridgeway Studio");
  });
});

describe("planRowCorrection", () => {
  const plan = planRowCorrection(BEN, BEN_CORRECTION);

  it("sends the complete current snapshot so a moved row fails closed", () => {
    // applyProvenanceCorrection compares all six fields before patching; a
    // partial snapshot would let a stale proposal overwrite a newer edit.
    expect(plan.expected).toEqual({
      title: "Continuum Infinitum",
      artist: "Ben Ridgeway",
      artist_url: "https://vimeo.com/41806282",
      credit_line: "Continuum Infinitum by Ben Ridgeway",
      source_url: "https://streamable.com/e/4tiz4u",
      rightsholder: "Ben Ridgeway",
    });
  });

  it("moves the name everywhere it is written, not just the artist column", () => {
    expect(plan.updates.artist).toBe("Ben Ridgway");
    expect(plan.updates.credit_line).toBe("Continuum Infinitum by Ben Ridgway");
    expect(plan.updates.rightsholder).toBe("Ben Ridgway");
    expect(plan.changedFields).toEqual(["artist", "credit_line", "rightsholder"]);
  });

  it("passes the URLs through untouched", () => {
    expect(plan.updates.artist_url).toBe(BEN.artist_url);
    expect(plan.updates.source_url).toBe(BEN.source_url);
    expect(plan.updates.title).toBe(BEN.title);
  });

  it("omits an absent optional field rather than sending null to a string validator", () => {
    const bare = planRowCorrection(
      { ...BEN, artist_url: null, source_url: null, rightsholder: null },
      BEN_CORRECTION,
    );

    expect("artist_url" in bare.updates).toBe(false);
    expect("source_url" in bare.updates).toBe(false);
    expect("rightsholder" in bare.updates).toBe(false);
  });

  it("reports the slug the corrected name would produce, and renames nothing", () => {
    expect(plan.slugConsequence).toEqual({
      changes: true,
      from: "continuum-infinitum-ben-ridgeway",
      to: "continuum-infinitum-ben-ridgway",
      collides: false,
    });
  });

  it("sees that a casing-only correction leaves the slug alone", () => {
    // Slugs are lowercased on derivation, so "Sam perkins" and "Sam Perkins"
    // produce the same one.
    expect(planRowCorrection(SAM, { stored: "Sam perkins", correct: "Sam Perkins" }).slugConsequence).toEqual({
      changes: false,
      slug: "switch-sam-perkins",
    });
  });

  it("treats a counter-disambiguated slug as settled rather than a colliding rename", () => {
    // untitled-salviadroid-2 is what normalize-slugs' resolveTarget mints when
    // the candidate untitled-salviadroid is taken; the correction must not
    // report it as a pending rename that collides with its own sibling.
    const settled = planRowCorrection(
      { ...BEN, slug: "untitled-salviadroid-2", title: "Untitled", artist: "Salviadroid" },
      { stored: "Salviadroid", correct: "SalviaDroid" },
      { existingSlugs: new Set(["untitled-salviadroid", "untitled-salviadroid-2"]) },
    );

    expect(settled.slugConsequence).toEqual({ changes: false, slug: "untitled-salviadroid-2" });
  });

  it("flags a corrected slug that is already taken", () => {
    const plan = planRowCorrection(MORACZ, { stored: "MOracs", correct: "MOracz" }, {
      existingSlugs: new Set(["hatheg-kla-moracz"]),
    });

    expect(plan.slugConsequence.collides).toBe(true);
  });

  it("renames a Reddit-archive credit without touching the source facts around it", () => {
    const plan = planRowCorrection(STINGRAYZ, STINGRAYZ_CORRECTION);

    expect(plan.updates).toEqual({
      title: STINGRAYZ.title,
      artist: "Symmetric Vision",
      credit_line:
        'This Friendly Stingrayz Says "Hi!" (Psychedelic Visuals) by Symmetric Vision. Archived from r/replications post gqcvye; submitter snapshot: StingrayZ.',
      artist_url: "https://www.reddit.com/user/StingrayZ/",
      source_url: "https://v.redd.it/gqcvye",
    });
    expect(plan.changedFields).toEqual(["artist", "credit_line"]);
  });
});

describe("planArtistNameCorrections", () => {
  it("plans every row credited to a misspelled name and reports the ones that match nothing", () => {
    const plan = planArtistNameCorrections([BEN, SAM, MORACZ], CORRECTIONS);

    expect(plan.rows.map((row) => row.slug)).toEqual([
      "continuum-infinitum-ben-ridgeway",
      "hatheg-kla-moracs",
      "switch-sam-perkins",
    ]);
    // Simon Haid and StingrayZ are corrections with no row in this fixture; a
    // correction that silently matches nothing is a typo waiting to be
    // discovered after the write.
    expect(plan.unmatched.map((entry) => entry.stored)).toEqual(["Simon Haid", "StingrayZ"]);
  });

  it("reports a row that already carries the corrected credit as settled, not as a write", () => {
    const settledRow = {
      ...BEN,
      slug: "continuum-infinitum-ben-ridgway",
      artist: "Ben Ridgway",
      credit_line: "Continuum Infinitum by Ben Ridgway",
      rightsholder: "Ben Ridgway",
    };
    // "Ben Ridgway" is not a stored name on file, so it needs a casing-only
    // correction to be matched at all: the same fold that makes the on-file
    // "symmetric vision" entry meet every row already credited "Symmetric Vision".
    const plan = planArtistNameCorrections([settledRow, STINGRAYZ], [
      { stored: "ben ridgway", correct: "Ben Ridgway" },
      STINGRAYZ_CORRECTION,
    ]);

    expect(plan.rows.map((row) => row.slug)).toEqual([STINGRAYZ.slug]);
    expect(plan.settled).toEqual([{ slug: "continuum-infinitum-ben-ridgway", artist: "Ben Ridgway" }]);
    expect(plan.unmatched).toEqual([]);
  });
});

describe("planSlugConsequences", () => {
  const rows = planArtistNameCorrections([BEN, SAM, MORACZ], CORRECTIONS).rows;

  it("lists the redirects the renames would need", () => {
    const plan = planSlugConsequences(rows, {});

    expect(plan.newAliases).toEqual([
      { from: "continuum-infinitum-ben-ridgeway", to: "continuum-infinitum-ben-ridgway" },
      { from: "hatheg-kla-moracs", to: "hatheg-kla-moracz" },
    ]);
    expect(plan.unchanged).toEqual(["switch-sam-perkins"]);
  });

  it("catches an existing alias whose target moves out from under it", () => {
    // The alias map resolves one hop only, so this entry would send an
    // already-shared legacy URL to a 404 the moment the rename lands.
    const plan = planSlugConsequences(rows, {
      "hatheg-kla_by_moracz-unknown": "hatheg-kla-moracs",
      "shuplyak_faces_10-unknown": "optical-illusion-oleg-shupliak",
    });

    expect(plan.staleAliases).toEqual([
      {
        source: "hatheg-kla_by_moracz-unknown",
        currentTarget: "hatheg-kla-moracs",
        shouldRetargetTo: "hatheg-kla-moracz",
      },
    ]);
  });
});
