#!/usr/bin/env node
/**
 * One-time script to manually fix fragmented legality entries
 * These entries have been hand-crafted to be grammatically coherent
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const parsedPath = path.join(ROOT, "src/data/parsed-sources.json");

const parsed = JSON.parse(fs.readFileSync(parsedPath, "utf-8"));

// Manual fixes - each entry has been hand-crafted for coherence
const manualFixes = {
  morphine: [
    {
      country: "Australia",
      status: "Morphine is a Schedule 8 drug under the State and Territory Poisons Acts.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "Canada",
      status: "Morphine is a Schedule I drug under the Controlled Drugs and Substances Act.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "France",
      status: "Morphine is in the strictest schedule of controlled substances under the December 1970 French controlled substances law.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "Germany",
      status: "Morphine is listed under Anlage III (equivalent to US Schedule II) of the Betäubungsmittelgesetz as a controlled narcotic.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "Switzerland",
      status: "Morphine is scheduled similarly to Germany's legal classification.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "Japan",
      status: "Morphine is classified as a narcotic under the Narcotics and Psychotropics Control Act.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "Netherlands",
      status: "Morphine is a List 1 drug under the Opium Law.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "New Zealand",
      status: "Morphine is a Class B drug under the Misuse of Drugs Act 1975.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "United Kingdom",
      status: "Morphine is a Class A drug under the Misuse of Drugs Act 1971 and a Schedule 2 Controlled Drug under the Misuse of Drugs Regulations 2001.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "United States",
      status: "Morphine is a Schedule II controlled substance under the Controlled Substances Act.",
      source: "wikipedia",
      manuallyEdited: true
    }
  ],

  pcp: [
    {
      country: "Canada",
      status: "PCP is a Schedule I drug under the Controlled Drugs and Substances Act.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "United States",
      status: "PCP is a Schedule II controlled substance.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "Netherlands",
      status: "PCP is a List I drug under the Opium Law.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "United Kingdom",
      status: "PCP is a Class A substance under the Misuse of Drugs Act.",
      source: "wikipedia",
      manuallyEdited: true
    }
  ],

  zolpidem: [
    {
      country: "United States",
      status: "Zolpidem is a Schedule IV controlled substance.",
      source: "wikipedia",
      manuallyEdited: true
    }
  ],

  "2-ma": [
    {
      country: "United States",
      status: "2-Methylamphetamine is a Schedule II controlled substance.",
      source: "wikipedia",
      manuallyEdited: true
    }
  ],

  // BOD entries are mostly good, just clean up the Canada one
  bod: [
    {
      country: "Canada",
      status: "DOB is a Schedule 1 substance as it is an analogue of amphetamine.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "Australia",
      status: "DOB is a Schedule 9 prohibited substance under the Poisons Standard.",
      details: "A Schedule 9 substance is one which may be abused or misused, the manufacture, possession, sale or use of which should be prohibited by law except when required for medical or scientific research.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "Russia",
      status: "DOB is a Schedule I substance; possession of 10 mg or more is a criminal offence.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "United Kingdom",
      status: "DOB is a Class A drug under the Misuse of Drugs Act 1971.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "United States",
      status: "DOB is a Schedule I controlled substance, scheduled in 1973.",
      source: "wikipedia",
      manuallyEdited: true
    }
  ],

  bromazolam: [
    {
      country: "United States",
      status: "Bromazolam is currently unscheduled at the federal level. However, pursuant to a DEA notice, it will be placed into Schedule I federally on January 14, 2026 for 2 years with a possible one-year extension.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "United Kingdom",
      status: "Bromazolam is a Class C controlled substance.",
      source: "wikipedia",
      manuallyEdited: true
    }
  ],

  dihydrocodeine: [
    {
      country: "Australia",
      status: "Dihydrocodeine is a Schedule 3 'pharmacist only' drug when indicated for cough suppression and compounded with other therapeutically active substances, not exceeding 15 mg per dose.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "Hong Kong",
      status: "Dihydrocodeine is regulated under Schedule 1 of Hong Kong's Chapter 134 Dangerous Drugs Ordinance.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "Japan",
      status: "Dihydrocodeine is available without a prescription and is used in cough medicines such as New Bron Solution-ACE.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "United Kingdom",
      status: "Dihydrocodeine is a Class B drug, but is available over-the-counter in small amounts (less than 8 mg) when combined with paracetamol.",
      source: "wikipedia",
      manuallyEdited: true
    }
  ],

  // ET - fix the malformed country and improve UK entry
  et: [
    {
      country: "United States",
      status: "Alpha-ethyltryptamine (αET) is a Schedule I controlled substance.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "United Kingdom",
      status: "Alpha-ethyltryptamine is a Class A controlled substance.",
      source: "wikipedia",
      manuallyEdited: true
    }
  ],

  ghb: [
    {
      country: "Hong Kong",
      status: "GHB is regulated under Schedule 1 of Hong Kong's Chapter 134 Dangerous Drugs Ordinance.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "Chile",
      status: "GHB is a controlled drug under the Ley de substancias psicotrópicas y estupefacientes (psychotropic substances and narcotics law).",
      source: "wikipedia",
      manuallyEdited: true
    }
  ],

  ketazolam: [
    {
      country: "United States",
      status: "Ketazolam is a Schedule IV controlled substance.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "Netherlands",
      status: "Ketazolam is a List II drug under the Opium Law.",
      source: "wikipedia",
      manuallyEdited: true
    }
  ],

  // MT-45 - remove the garbage "maximum" entry, fix UK
  "mt-45": [
    {
      country: "United Kingdom",
      status: "MT-45 is a Class A drug.",
      source: "wikipedia",
      manuallyEdited: true
    }
  ],

  // Nicomorphine - fix the malformed country name
  nicomorphine: [
    {
      country: "United States",
      status: "Nicomorphine is a Schedule I controlled substance. It was never introduced to the US market.",
      source: "wikipedia",
      manuallyEdited: true
    }
  ],

  pbp: [
    {
      country: "United States",
      status: "PBP is a Schedule I controlled substance.",
      source: "wikipedia",
      manuallyEdited: true
    }
  ],

  // 5-IT - remove the garbage entries, keep Germany
  "5-it": [
    {
      country: "Germany",
      status: "5-IT is an Anlage I controlled drug.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "United Kingdom",
      status: "5-IT was banned as a temporary class drug.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "Sweden",
      status: "5-IT is illegal.",
      source: "wikipedia",
      manuallyEdited: true
    },
    {
      country: "Denmark",
      status: "5-IT is illegal.",
      source: "wikipedia",
      manuallyEdited: true
    }
  ]
};

// Apply fixes
let fixedCount = 0;
for (const [slug, newLegal] of Object.entries(manualFixes)) {
  if (parsed.substances[slug]) {
    parsed.substances[slug].legal = newLegal;
    fixedCount++;
    console.log(`Fixed: ${slug} (${newLegal.length} entries)`);
  } else {
    console.log(`Warning: substance "${slug}" not found`);
  }
}

// Write back
fs.writeFileSync(parsedPath, JSON.stringify(parsed, null, 2) + "\n");
console.log(`\nDone! Fixed ${fixedCount} substances.`);
console.log(`Written to: ${parsedPath}`);
