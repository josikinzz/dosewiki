import { pharmacologyProposalAdapter } from "./pharmacology-adapter.mjs";
import { summaryProposalAdapter } from "./summary-adapter.mjs";

export const sectionProposalAdapters = Object.freeze({
  summary: summaryProposalAdapter,
  pharmacology: pharmacologyProposalAdapter,
});

export function getSectionProposalAdapter(section) {
  const adapter = sectionProposalAdapters[section];
  if (!adapter) {
    throw new Error(`Unsupported proposal section: ${section}. Supported sections: ${Object.keys(sectionProposalAdapters).join(", ")}.`);
  }
  return adapter;
}
