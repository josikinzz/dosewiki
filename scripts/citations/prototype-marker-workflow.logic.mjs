// PROTOTYPE - throwaway logic for feeling out the citation-only workflow.
// Question: does the section-first, marker-only validation model stay simple
// when sections pass, fail, repair, archive, and feed a final article-wide pass?

export const CITABLE_SECTIONS = Object.freeze([
  "summary",
  "pharmacology",
  "tolerance",
  "harm_potential",
  "history_culture",
  "legality",
]);

export const EXCLUDED_SECTIONS = Object.freeze([
  "dosage",
  "duration",
  "subjective_effects",
  "comparisons",
  "reagent_testing",
  "interactions",
  "identification",
  "classification",
]);

const MARKER_RE = /\[cite:([A-Za-z0-9][A-Za-z0-9._:-]*)\]/g;
const MARKER_LIKE_RE = /\[cite:[^\]]*\]?/g;

export function stripCitationMarkers(text) {
  return String(text ?? "").replace(MARKER_RE, "");
}

export function collectCitationMarkers(text) {
  return [...String(text ?? "").matchAll(MARKER_RE)].map((match) => ({
    marker: match[0],
    referenceId: match[1],
    index: match.index,
  }));
}

export function validateMarkedText({ sectionKey, originalText, candidateText, knownReferenceIds }) {
  const diagnostics = [];
  const known = new Set(knownReferenceIds);
  const candidate = String(candidateText ?? "");
  const original = String(originalText ?? "");
  const validMarkers = collectCitationMarkers(candidate);
  const validMarkerText = new Set(validMarkers.map((entry) => entry.marker));

  if (!CITABLE_SECTIONS.includes(sectionKey)) {
    diagnostics.push({
      code: "section_not_citable",
      message: `${sectionKey} is not in the citable article surface.`,
    });
  }

  for (const markerLike of candidate.match(MARKER_LIKE_RE) ?? []) {
    if (!validMarkerText.has(markerLike)) {
      diagnostics.push({
        code: "malformed_marker",
        message: `Malformed citation marker: ${markerLike}`,
      });
    }
  }

  for (const marker of validMarkers) {
    if (!known.has(marker.referenceId)) {
      diagnostics.push({
        code: "unknown_reference",
        message: `${marker.marker} points to an unknown reference.`,
      });
    }
  }

  const stripped = stripCitationMarkers(candidate);
  if (stripped !== original) {
    diagnostics.push({
      code: "text_changed",
      message: firstDifferenceMessage(original, stripped),
    });
  }

  return {
    ok: diagnostics.length === 0,
    markerCount: validMarkers.length,
    markers: validMarkers,
    strippedText: stripped,
    diagnostics,
  };
}

export function buildSectionPacket(article, sectionKey) {
  if (!CITABLE_SECTIONS.includes(sectionKey)) {
    throw new Error(`${sectionKey} is not citable in this prototype.`);
  }
  return {
    sectionKey,
    text: article[sectionKey],
  };
}

export function buildArticleWidePacket(state) {
  const sections = {};
  for (const sectionKey of CITABLE_SECTIONS) {
    sections[sectionKey] = state.acceptedMarkedText[sectionKey] ?? state.article[sectionKey];
  }
  return {
    sections,
    failedSectionKeys: [...state.failedSectionKeys],
    archivedFailureCount: state.failedArtifacts.length,
  };
}

export function createInitialState() {
  const article = {
    identification: "2C-B is commonly identified by its chemical and common names.",
    classification: "2C-B is a substituted phenethylamine.",
    summary: "2C-B is a psychedelic phenethylamine first synthesized in the 1970s.",
    dosage: "Dose ranges are intentionally excluded from this citation pass.",
    duration: "Duration data is intentionally excluded from this citation pass.",
    subjective_effects: "Subjective effects are sourced elsewhere and excluded here.",
    comparisons: "Comparisons are excluded here.",
    pharmacology: "2C-B acts primarily through serotonin receptor activity.",
    interactions: "Interactions are handled through a separate TripSit-derived source path.",
    reagent_testing: "Reagent testing is handled through a separate ProtestKit-derived source path.",
    tolerance: "Tolerance to 2C-B may develop with repeated use.",
    harm_potential: "Published human toxicity data for 2C-B remains limited.",
    history_culture: "2C-B became associated with psychonaut and club cultures after its synthesis.",
    legality: "In the United States, 2C-B is a Schedule I controlled substance. In Canada, it is controlled under federal law.",
  };

  return {
    article,
    references: {
      shulgin1991: {
        id: "shulgin1991",
        type: "book",
        title: "PiHKAL",
        sourcePolicy: "wikipedia_grade",
      },
      dea2cb: {
        id: "dea2cb",
        type: "report",
        title: "DEA controlled substance scheduling record for 2C-B",
        sourcePolicy: "government_or_regulatory",
      },
      caControlled: {
        id: "caControlled",
        type: "web",
        title: "Canadian controlled substances listing",
        sourcePolicy: "government_or_regulatory",
      },
      receptorStudy: {
        id: "receptorStudy",
        type: "journal",
        title: "Serotonin receptor activity study",
        sourcePolicy: "wikipedia_grade",
      },
    },
    sectionStatus: Object.fromEntries(CITABLE_SECTIONS.map((key) => [key, "pending"])),
    acceptedMarkedText: {},
    failedSectionKeys: [],
    failedArtifacts: [],
    articleWide: {
      status: "not_started",
      acceptedSections: [],
      rejectedSections: [],
    },
    lastValidation: null,
    lastAction: "Initialized prototype.",
  };
}

export function applySectionCandidate(state, sectionKey, candidateText, note) {
  const validation = validateMarkedText({
    sectionKey,
    originalText: state.article[sectionKey],
    candidateText,
    knownReferenceIds: Object.keys(state.references),
  });
  const next = cloneState(state);
  next.lastValidation = { sectionKey, ...validation };
  next.lastAction = note;

  if (validation.ok) {
    next.acceptedMarkedText[sectionKey] = candidateText;
    next.sectionStatus[sectionKey] = "accepted";
    next.failedSectionKeys = next.failedSectionKeys.filter((key) => key !== sectionKey);
  } else {
    next.sectionStatus[sectionKey] = "failed";
    if (!next.failedSectionKeys.includes(sectionKey)) {
      next.failedSectionKeys.push(sectionKey);
    }
    next.failedArtifacts.push({
      sectionKey,
      candidateText,
      diagnostics: validation.diagnostics,
      note,
    });
  }

  return next;
}

export function repairSectionCandidate(state, sectionKey, candidateText) {
  return applySectionCandidate(
    state,
    sectionKey,
    candidateText,
    `Repair attempted for ${sectionKey}.`,
  );
}

export function archiveFailedSection(state, sectionKey) {
  const next = cloneState(state);
  if (next.sectionStatus[sectionKey] === "failed") {
    next.sectionStatus[sectionKey] = "archived_failed";
    next.failedSectionKeys = next.failedSectionKeys.filter((key) => key !== sectionKey);
    next.lastAction = `${sectionKey} failure archived and excluded from accepted output.`;
  } else {
    next.lastAction = `${sectionKey} is not currently failed, so nothing was archived.`;
  }
  return next;
}

export function applyArticleWideCandidate(state, markedSections) {
  const packet = buildArticleWidePacket(state);
  const next = cloneState(state);
  const acceptedSections = [];
  const rejectedSections = [];

  for (const [sectionKey, candidateText] of Object.entries(markedSections)) {
    const originalText = stripCitationMarkers(packet.sections[sectionKey]);
    const validation = validateMarkedText({
      sectionKey,
      originalText,
      candidateText,
      knownReferenceIds: Object.keys(next.references),
    });
    if (validation.ok) {
      next.acceptedMarkedText[sectionKey] = candidateText;
      next.sectionStatus[sectionKey] = "accepted";
      acceptedSections.push(sectionKey);
    } else {
      rejectedSections.push({ sectionKey, diagnostics: validation.diagnostics });
      next.failedArtifacts.push({
        sectionKey,
        candidateText,
        diagnostics: validation.diagnostics,
        note: "Article-wide candidate failed validation.",
      });
    }
  }

  next.articleWide = {
    status: rejectedSections.length ? "partial" : "accepted",
    acceptedSections,
    rejectedSections,
  };
  next.lastValidation = rejectedSections.at(-1) ?? {
    sectionKey: "article-wide",
    ok: true,
    markerCount: Object.values(markedSections).reduce((sum, text) => (
      sum + collectCitationMarkers(text).length
    ), 0),
    diagnostics: [],
  };
  next.lastAction = "Article-wide pass ran over citable surface with accepted section citations visible.";
  return next;
}

export function workflowSummary(state) {
  const markerCount = Object.values(state.acceptedMarkedText).reduce((sum, text) => (
    sum + collectCitationMarkers(text).length
  ), 0);
  return {
    acceptedSections: Object.entries(state.sectionStatus)
      .filter(([, status]) => status === "accepted")
      .map(([sectionKey]) => sectionKey),
    failedSections: Object.entries(state.sectionStatus)
      .filter(([, status]) => status === "failed")
      .map(([sectionKey]) => sectionKey),
    failureArtifacts: state.failedArtifacts.length,
    publicMarkerCount: markerCount,
    articleWideStatus: state.articleWide.status,
  };
}

export const SAMPLE_CANDIDATES = Object.freeze({
  validLegality:
    "In the United States, 2C-B is a Schedule I controlled substance[cite:dea2cb]. In Canada, it is controlled under federal law[cite:caControlled].",
  invalidHarmRewrite:
    "Published human toxicity data for 2C-B remains sparse[cite:receptorStudy].",
  repairedHarm:
    "Published human toxicity data for 2C-B remains limited[cite:receptorStudy].",
  malformedSummary:
    "2C-B is a psychedelic phenethylamine[cite:] first synthesized in the 1970s.",
  articleWide: {
    summary:
      "2C-B is a psychedelic phenethylamine first synthesized in the 1970s[cite:shulgin1991].",
    pharmacology:
      "2C-B acts primarily through serotonin receptor activity[cite:receptorStudy].",
    tolerance:
      "Tolerance to 2C-B may develop with repeated use[cite:receptorStudy].",
    history_culture:
      "2C-B became associated with psychonaut and club cultures after its synthesis[cite:shulgin1991].",
  },
});

function cloneState(state) {
  return structuredClone(state);
}

function firstDifferenceMessage(left, right) {
  const max = Math.max(left.length, right.length);
  for (let index = 0; index < max; index += 1) {
    if (left[index] !== right[index]) {
      return `Text differs at index ${index}: expected ${JSON.stringify(left.slice(index, index + 24))}, got ${JSON.stringify(right.slice(index, index + 24))}.`;
    }
  }
  return "Text changed outside citation markers.";
}
