import type { InteractionGroup, InteractionTarget } from "../types/content";
import type { SubstanceRecord } from "../data/contentBuilder";

const SEVERITY_ORDER: InteractionGroup["severity"][] = ["danger", "unsafe", "caution"];
const SEVERITY_SCORE: Record<InteractionGroup["severity"], number> = {
  danger: 3,
  unsafe: 2,
  caution: 1,
};

export interface InteractionSummaryEntry {
  slug: string;
  target: InteractionTarget;
  severity: InteractionGroup["severity"];
}

export interface SharedInteractionEntry {
  slug: string;
  primary: InteractionSummaryEntry;
  secondary: InteractionSummaryEntry;
  highestSeverity: InteractionGroup["severity"];
}

export interface InteractionComparisonBucket {
  severity: InteractionGroup["severity"];
  shared: SharedInteractionEntry[];
  onlyPrimary: InteractionSummaryEntry[];
  onlySecondary: InteractionSummaryEntry[];
}

export interface DirectMatchEntry {
  direction: "primary" | "secondary";
  severity: InteractionGroup["severity"];
  target: InteractionTarget;
}

export interface SharedClassHighlight {
  key: string;
  label: string;
}

export interface InteractionComparisonResult {
  buckets: InteractionComparisonBucket[];
  directMatches: DirectMatchEntry[];
  sharedClassHighlights: SharedClassHighlight[];
  highestRisk?: InteractionGroup["severity"];
}

const compareSeverity = (
  a: InteractionGroup["severity"],
  b: InteractionGroup["severity"],
): InteractionGroup["severity"] => (SEVERITY_SCORE[a] >= SEVERITY_SCORE[b] ? a : b);

const determineHighestSeverity = (
  values: InteractionGroup["severity"][],
): InteractionGroup["severity"] | undefined => {
  return values.reduce<InteractionGroup["severity"] | undefined>((current, severity) => {
    if (!current) {
      return severity;
    }
    return compareSeverity(current, severity);
  }, undefined);
};

const collectInteractionSummaries = (record: SubstanceRecord): Map<string, InteractionSummaryEntry> => {
  const summary = new Map<string, InteractionSummaryEntry>();

  record.content.interactions.forEach((group) => {
    group.items.forEach((target) => {
      const existing = summary.get(target.slug);
      if (!existing || SEVERITY_SCORE[group.severity] > SEVERITY_SCORE[existing.severity]) {
        summary.set(target.slug, {
          slug: target.slug,
          target,
          severity: group.severity,
        });
      }
    });
  });

  return summary;
};

const collectClassHighlights = (record: SubstanceRecord): Map<string, string> => {
  const classes = new Map<string, string>();
  record.content.interactions.forEach((group) => {
    group.items.forEach((target) => {
      if (target.classKey && target.classLabel && !classes.has(target.classKey)) {
        classes.set(target.classKey, target.classLabel);
      }
    });
  });
  return classes;
};

const collectDirectMatches = (
  record: SubstanceRecord,
  targetSlug: string,
  direction: DirectMatchEntry["direction"],
): DirectMatchEntry[] => {
  const matches: DirectMatchEntry[] = [];
  record.content.interactions.forEach((group) => {
    group.items.forEach((item) => {
      if (item.matchedSubstanceSlug === targetSlug) {
        matches.push({
          direction,
          severity: group.severity,
          target: item,
        });
      }
    });
  });
  return matches;
};

export function compareInteractions(
  primary: SubstanceRecord,
  secondary: SubstanceRecord,
): InteractionComparisonResult {
  const primarySummary = collectInteractionSummaries(primary);
  const secondarySummary = collectInteractionSummaries(secondary);

  const buckets = SEVERITY_ORDER.map<InteractionComparisonBucket>((severity) => ({
    severity,
    shared: [],
    onlyPrimary: [],
    onlySecondary: [],
  }));

  const bucketLookup = new Map(buckets.map((bucket) => [bucket.severity, bucket]));

  const allSlugs = new Set<string>([
    ...primarySummary.keys(),
    ...secondarySummary.keys(),
  ]);

  const classHighlights = collectClassHighlights(primary);
  const secondaryClasses = collectClassHighlights(secondary);
  const sharedClassHighlights: SharedClassHighlight[] = [];

  classHighlights.forEach((label, key) => {
    if (secondaryClasses.has(key)) {
      sharedClassHighlights.push({ key, label });
    }
  });

  const highestSeverities: InteractionGroup["severity"][] = [];

  allSlugs.forEach((slug) => {
    const primaryEntry = primarySummary.get(slug);
    const secondaryEntry = secondarySummary.get(slug);

    if (primaryEntry && secondaryEntry) {
      const bucketSeverity = compareSeverity(primaryEntry.severity, secondaryEntry.severity);
      const bucket = bucketLookup.get(bucketSeverity);
      if (!bucket) {
        return;
      }

      bucket.shared.push({
        slug,
        primary: primaryEntry,
        secondary: secondaryEntry,
        highestSeverity: bucketSeverity,
      });
      highestSeverities.push(bucketSeverity);
      return;
    }

    if (primaryEntry) {
      bucketLookup.get(primaryEntry.severity)?.onlyPrimary.push(primaryEntry);
      highestSeverities.push(primaryEntry.severity);
      return;
    }

    if (secondaryEntry) {
      bucketLookup.get(secondaryEntry.severity)?.onlySecondary.push(secondaryEntry);
      highestSeverities.push(secondaryEntry.severity);
    }
  });

  const directMatches = [
    ...collectDirectMatches(primary, secondary.slug, "primary"),
    ...collectDirectMatches(secondary, primary.slug, "secondary"),
  ];

  directMatches.forEach((entry) => {
    highestSeverities.push(entry.severity);
  });

  const highestRisk = determineHighestSeverity(highestSeverities);

  // Sort buckets for consistent ordering of entries.
  buckets.forEach((bucket) => {
    bucket.shared.sort((a, b) => SEVERITY_SCORE[b.highestSeverity] - SEVERITY_SCORE[a.highestSeverity]);
    bucket.onlyPrimary.sort((a, b) => SEVERITY_SCORE[b.severity] - SEVERITY_SCORE[a.severity]);
    bucket.onlySecondary.sort((a, b) => SEVERITY_SCORE[b.severity] - SEVERITY_SCORE[a.severity]);
  });

  return {
    buckets,
    directMatches,
    sharedClassHighlights,
    highestRisk,
  };
}
