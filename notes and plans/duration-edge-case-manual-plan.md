# Duration Edge Case Manual Plan

## Context
- Source: `src/data/durationMigrationSkips.json` currently lists 23 articles that the automated splitter could not migrate (23 ambiguous segments, 38 route mismatches).
- Goal: manually author per-ROA duration tables for each affected article so they can adopt the new `{ routes_of_administration[] }` schema without rerunning the splitter.
- This document now tracks only the remaining unresolved records; previously completed items (e.g., 3-Methyl-4-fluoro-α-pyrrolidinovalerophenone, AMB-FUBINACA, etc.) were implemented directly in `src/data/articles.json`.

## General Editing Checklist
- Back up `src/data/articles.json` before editing.
- Ensure dosage and duration route labels stay in sync; add `canonical_routes` arrays that reflect the shared synonym map in `routeSynonyms.json`.
- Duplicate shared copy across routes instead of relying on `general` fallbacks so every table renders as a complete block.
- Note any remaining data gaps in `notes and plans/duration-roa-audit.md` when new sources are required.

---

### 2C-T-7-NBOMe
- **Issue**: Onset text references "buccal / sublingual" but the dataset only exposes a `sublingual` dosage route.
- **Manual fix**:
  1. Rename occurrences of "sublingual / buccal" in dosage + duration to just `sublingual` so the parser sees a one-to-one match.
  2. Split the legacy timings into per-route stages (sublingual, insufflated, oral) and duplicate the shared peak/offset values.
- **Proposed duration JSON**
```json
{
  "routes_of_administration": [
    {
      "route": "sublingual",
      "canonical_routes": ["sublingual"],
      "stages": {
        "total_duration": "6-10 hours",
        "onset": "15-45 minutes",
        "peak": "2-4 hours",
        "offset": "2-4 hours",
        "after_effects": "2-8 hours residual stimulation / insomnia"
      }
    },
    {
      "route": "insufflated",
      "canonical_routes": ["insufflated"],
      "stages": {
        "total_duration": "6-10 hours",
        "onset": "5-15 minutes",
        "peak": "2-4 hours",
        "offset": "2-4 hours",
        "after_effects": "2-8 hours residual stimulation / insomnia"
      }
    },
    {
      "route": "oral",
      "canonical_routes": ["oral"],
      "stages": {
        "total_duration": "6-10 hours",
        "onset": "30-60 minutes",
        "peak": "2-4 hours",
        "offset": "2-4 hours",
        "after_effects": "2-8 hours residual stimulation / insomnia"
      }
    }
  ]
}
```

---

### 4-MMC
- **Issue**: Total duration clause combined oral and intranasal values; rectal and intravenous totals were never supplied.
- **Manual fix**:
  1. Split the shared sentence into discrete per-route tables using the existing onset timings.
  2. Research authoritative totals for rectal and intravenous routes (placeholders below need real data before promotion).
- **Proposed duration JSON**
```json
{
  "routes_of_administration": [
    {
      "route": "oral",
      "canonical_routes": ["oral"],
      "stages": {
        "total_duration": "2-4 hours",
        "onset": "15-45 minutes",
        "peak": "0.5-1.5 hours",
        "offset": "1-2 hours",
        "after_effects": "2-24 hours residual stimulation, dysphoria, insomnia"
      }
    },
    {
      "route": "insufflated",
      "canonical_routes": ["insufflated"],
      "stages": {
        "total_duration": "1.5-3 hours",
        "onset": "5-15 minutes",
        "peak": "0.5-1.5 hours",
        "offset": "1-2 hours",
        "after_effects": "2-24 hours residual stimulation, dysphoria, insomnia"
      }
    },
    {
      "route": "rectal",
      "canonical_routes": ["rectal"],
      "stages": {
        "total_duration": "TBD (confirm with primary sources)",
        "onset": "10-20 minutes",
        "peak": "0.5-1.5 hours",
        "offset": "1-2 hours",
        "after_effects": "2-24 hours residual stimulation, dysphoria, insomnia"
      }
    },
    {
      "route": "intravenous",
      "canonical_routes": ["intravenous"],
      "stages": {
        "total_duration": "TBD (clinical data needed)",
        "onset": "<5 minutes",
        "peak": "0.5-1.5 hours",
        "offset": "1-2 hours",
        "after_effects": "2-24 hours residual stimulation, dysphoria, insomnia"
      }
    }
  ]
}
```

---

### Acrylfentanyl
- **Issue**: Onset text mixes intravenous, intranasal, oral, and inhaled timings in a single string; inhaled data is incomplete.
- **Manual fix**:
  1. Author discrete tables for oral, insufflated, intravenous, and inhaled routes.
  2. Investigate inhaled onset and peak windows before finalizing (placeholder below).
- **Proposed duration JSON**
```json
{
  "routes_of_administration": [
    {
      "route": "oral",
      "canonical_routes": ["oral"],
      "stages": {
        "total_duration": "2-5 hours",
        "onset": "15-30 minutes",
        "peak": "30-90 minutes",
        "offset": "1-3 hours",
        "after_effects": "6-24 hours residual lethargy and rebound pain"
      }
    },
    {
      "route": "insufflated",
      "canonical_routes": ["insufflated"],
      "stages": {
        "total_duration": "2-5 hours",
        "onset": "1-5 minutes",
        "peak": "30-90 minutes",
        "offset": "1-3 hours",
        "after_effects": "6-24 hours residual lethargy and rebound pain"
      }
    },
    {
      "route": "intravenous",
      "canonical_routes": ["intravenous"],
      "stages": {
        "total_duration": "2-5 hours",
        "onset": "0.5-2 minutes",
        "peak": "30-90 minutes",
        "offset": "1-3 hours",
        "after_effects": "6-24 hours residual lethargy and rebound pain"
      }
    },
    {
      "route": "inhaled",
      "canonical_routes": ["inhaled"],
      "stages": {
        "total_duration": "2-5 hours",
        "onset": "TBD (additional data required)",
        "peak": "30-90 minutes",
        "offset": "1-3 hours",
        "after_effects": "6-24 hours residual lethargy and rebound pain"
      }
    }
  ]
}
```

---

### ADB-PINACA
- **Issue**: Onset combines "Smoked / vaporized" while dosage only defines `smoked` and `oral` routes.
- **Manual fix**:
  1. Add a dedicated `vaporized` dosage route (mirroring the smoked dose ranges) or rephrase timing text to mention smoked only.
  2. Provide discrete duration tables for smoked, vaporized, and oral routes; reuse residual-effects copy across them.
- **Proposed duration JSON**
```json
{
  "routes_of_administration": [
    {
      "route": "smoked",
      "canonical_routes": ["smoked"],
      "stages": {
        "total_duration": "1-3 hours",
        "onset": "30-120 seconds",
        "peak": "5-30 minutes",
        "offset": "1-2 hours",
        "after_effects": "6-24 hours residual anxiety, lethargy, insomnia"
      }
    },
    {
      "route": "vaporized",
      "canonical_routes": ["vaporized"],
      "stages": {
        "total_duration": "1-3 hours",
        "onset": "30-120 seconds",
        "peak": "5-30 minutes",
        "offset": "1-2 hours",
        "after_effects": "6-24 hours residual anxiety, lethargy, insomnia"
      }
    },
    {
      "route": "oral",
      "canonical_routes": ["oral"],
      "stages": {
        "total_duration": "2-3 hours",
        "onset": "15-45 minutes",
        "peak": "30-90 minutes",
        "offset": "2-3 hours",
        "after_effects": "6-24 hours residual anxiety, lethargy, insomnia"
      }
    }
  ]
}
```

---

### Adderall XR
- **Issue**: Onset text only references "oral" broadly; need separate timings for intact XR capsules, beads crushed/parachuted, insufflated, and rectal routes.
- **Manual fix**:
  1. Author distinct oral entries (intact capsule vs. crushed beads) with timing differences validated against pharmacokinetic sources.
  2. Keep peak/offset consistent unless clinical data supports variation.
- **Proposed duration JSON**
```json
{
  "routes_of_administration": [
    {
      "route": "oral (intact XR capsule)",
      "canonical_routes": ["oral"],
      "stages": {
        "total_duration": "10-12 hours",
        "onset": "30-60 minutes",
        "peak": "4-7 hours",
        "offset": "2-4 hours",
        "after_effects": "6-24 hours fatigue, anhedonia, irritability"
      }
    },
    {
      "route": "oral (beads crushed / parachuted)",
      "canonical_routes": ["oral"],
      "stages": {
        "total_duration": "8-11 hours",
        "onset": "15-30 minutes",
        "peak": "3-5 hours",
        "offset": "2-4 hours",
        "after_effects": "6-24 hours fatigue, anhedonia, irritability"
      }
    },
    {
      "route": "insufflated (crushed beads)",
      "canonical_routes": ["insufflated"],
      "stages": {
        "total_duration": "6-8 hours",
        "onset": "10-25 minutes",
        "peak": "2-4 hours",
        "offset": "2-3 hours",
        "after_effects": "6-24 hours fatigue, anhedonia, irritability"
      }
    },
    {
      "route": "rectal (crushed beads in solution)",
      "canonical_routes": ["rectal"],
      "stages": {
        "total_duration": "6-8 hours",
        "onset": "5-15 minutes",
        "peak": "2-4 hours",
        "offset": "2-3 hours",
        "after_effects": "6-24 hours fatigue, anhedonia, irritability"
      }
    }
  ]
}
```

---

### CBDVA
- **Issue**: Timings reference "inhaled" while dosage distinguishes `oral`, `sublingual`, and `vaporized` routes; sublingual onset missing.
- **Manual fix**:
  1. Duplicate inhalation copy for the `vaporized` route.
  2. Source sublingual onset/peak data or estimate based on tincture absorption (placeholder below tagged for follow-up).
- **Proposed duration JSON**
```json
{
  "routes_of_administration": [
    {
      "route": "oral",
      "canonical_routes": ["oral"],
      "stages": {
        "total_duration": "4-8 hours",
        "onset": "30-90 minutes",
        "peak": "2-4 hours",
        "offset": "2-4 hours",
        "after_effects": "Up to 12 hours mild relaxation"
      }
    },
    {
      "route": "sublingual",
      "canonical_routes": ["sublingual"],
      "stages": {
        "total_duration": "4-6 hours",
        "onset": "TBD (verify rapid absorption data)",
        "peak": "1-3 hours",
        "offset": "2-4 hours",
        "after_effects": "Up to 12 hours mild relaxation"
      }
    },
    {
      "route": "vaporized",
      "canonical_routes": ["vaporized"],
      "stages": {
        "total_duration": "2-3 hours",
        "onset": "1-5 minutes",
        "peak": "10-30 minutes",
        "offset": "1-2 hours",
        "after_effects": "Up to 12 hours mild relaxation"
      }
    }
  ]
}
```

---

### Fentanyl
- **Issue**: Duration strings reference intramuscular use without a matching dosage route; IV/IM timings combined.
- **Manual fix**:
  1. Add an `intramuscular` dosage route (clinical context) or adjust copy to focus on IV only.
  2. Provide discrete tables for oral, intravenous, intramuscular, and transdermal routes, keeping residual-effects copy aligned.
- **Proposed duration JSON**
```json
{
  "routes_of_administration": [
    {
      "route": "oral",
      "canonical_routes": ["oral"],
      "stages": {
        "total_duration": "4-6 hours",
        "onset": "20-40 minutes",
        "peak": "1-2 hours",
        "offset": "2-4 hours",
        "after_effects": "Residual sedation may persist for several hours"
      }
    },
    {
      "route": "intravenous",
      "canonical_routes": ["intravenous"],
      "stages": {
        "total_duration": "1-4 hours",
        "onset": "Seconds to minutes",
        "peak": "Minutes",
        "offset": "1-2 hours",
        "after_effects": "Residual sedation may persist for several hours"
      }
    },
    {
      "route": "intramuscular",
      "canonical_routes": ["intramuscular"],
      "stages": {
        "total_duration": "1-4 hours",
        "onset": "5-10 minutes",
        "peak": "15-30 minutes",
        "offset": "1-2 hours",
        "after_effects": "Residual sedation may persist for several hours"
      }
    },
    {
      "route": "transdermal",
      "canonical_routes": ["transdermal"],
      "stages": {
        "total_duration": "24-72 hours",
        "onset": "6-12 hours",
        "peak": "12-24 hours",
        "offset": "12-24 hours",
        "after_effects": "Residual sedation may persist for several hours"
      }
    }
  ]
}
```

---

### Isotonitazene
- **Issue**: Onset string references intravenous administration that does not have a companion dosage route.
- **Manual fix**:
  1. Move IV data into the article narrative (clinical note) or add a dedicated IV dosage entry if the team wants to surface it.
  2. For migration purposes, keep only insufflated and oral/sublingual tables populated.
- **Proposed duration JSON**
```json
{
  "routes_of_administration": [
    {
      "route": "insufflated",
      "canonical_routes": ["insufflated"],
      "stages": {
        "total_duration": "3-8 hours",
        "onset": "2-5 minutes",
        "peak": "0.5-2 hours",
        "offset": "2-4 hours",
        "after_effects": "Sedation and respiratory risk up to 12 hours"
      }
    },
    {
      "route": "oral / sublingual",
      "canonical_routes": ["oral", "sublingual"],
      "stages": {
        "total_duration": "4-8 hours",
        "onset": "15-30 minutes",
        "peak": "0.5-2 hours",
        "offset": "2-4 hours",
        "after_effects": "Sedation and respiratory risk up to 12 hours"
      }
    }
  ]
}
```

---

## Next Actions
1. Work through the remaining articles above, replacing placeholders (e.g., rectal 4-MMC totals, inhaled Acrylfentanyl onset) with sourced data.
2. After each manual update, rerun `node scripts/splitDurationByRoute.mjs` to regenerate verification artefacts, then run `npm run build` and `npm run build:inline`.
3. Remove resolved entries from this document and log progress in `notes and plans/duration-roa-audit.md` until the skip list is empty.
