import type { ReplicationDrugClass } from "../types/replications";

export type ReplicationTitleDrugRule = readonly [
  slug: string,
  name: string,
  drugClass: ReplicationDrugClass,
  pattern: RegExp,
];

export const DISSOCIATIVE_TITLE_DRUG_RULES: readonly ReplicationTitleDrugRule[] = [
  ["3-meo-pcp", "3-MeO-PCP", "dissociatives", /\b3[- ]?meo[- ]?pcp\b/giu],
  [
    "dxm",
    "DXM",
    "dissociatives",
    /\bdxm\b|\bdextromethorphan\b|\brobitussin\b|\bdelsym\b|\brobo[- ]?trip(?:ping)?\b/giu,
  ],
  [
    "ketamine",
    "Ketamine",
    "dissociatives",
    /\bketamine\b|\bketa\b|\bspecial[- ]?k\b|\bk[- ]?hole\b/giu,
  ],
  ["methoxetamine", "Methoxetamine", "dissociatives", /\bmxe\b|\bmethoxetamine\b/giu],
  [
    "nitrous-oxide",
    "Nitrous oxide",
    "dissociatives",
    /\bnitrous(?: oxide)?\b|\bn2[0o]\b|\blaughing gas\b|\bwhipp?ets?\b/giu,
  ],
  ["pcp", "PCP", "dissociatives", /\bpcp\b|\bangel dust\b/giu],
];
