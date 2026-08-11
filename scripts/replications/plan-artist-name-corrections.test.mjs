import { describe, expect, it } from "vitest";

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

const CORRECTIONS = loadArtistNameCorrections();
const BEN_CORRECTION = { stored: "Ben Ridgeway", correct: "Ben Ridgway" };

describe("loadArtistNameCorrections", () => {
  it("takes only the strong corrections that say they apply to the rows", () => {
    expect(CORRECTIONS.map((entry) => entry.stored)).toEqual([
      "Ben Ridgeway",
      "Simon Haid",
      "Insedigris",
      "MOracs",
      "Sam perkins",
    ]);
    for (const entry of CORRECTIONS) {
      expect(entry.strength).toBe("strong");
      expect(entry.correctsReplicationArtistField).toBe(true);
    }
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

  it("flags a corrected slug that is already taken", () => {
    const plan = planRowCorrection(MORACZ, { stored: "MOracs", correct: "MOracz" }, {
      existingSlugs: new Set(["hatheg-kla-moracz"]),
    });

    expect(plan.slugConsequence.collides).toBe(true);
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
    // Simon Haid and Insedigris are real corrections with no row in this
    // fixture; a correction that silently matches nothing is a typo waiting to
    // be discovered after the write.
    expect(plan.unmatched.map((entry) => entry.stored)).toEqual(["Simon Haid", "Insedigris"]);
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
