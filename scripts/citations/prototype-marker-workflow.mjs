#!/usr/bin/env node
// PROTOTYPE - throwaway terminal driver for citation-only workflow logic.

import { emitKeypressEvents } from "node:readline";
import {
  CITABLE_SECTIONS,
  EXCLUDED_SECTIONS,
  SAMPLE_CANDIDATES,
  applyArticleWideCandidate,
  applySectionCandidate,
  archiveFailedSection,
  buildArticleWidePacket,
  buildSectionPacket,
  createInitialState,
  repairSectionCandidate,
  workflowSummary,
} from "./prototype-marker-workflow.logic.mjs";

const bold = "\x1b[1m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";
const green = "\x1b[32m";
const red = "\x1b[31m";
const yellow = "\x1b[33m";

let state = createInitialState();

if (process.argv.includes("--demo")) {
  runDemo();
  process.exit(0);
}

render();
emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();
process.stdin.on("keypress", (_chunk, key) => {
  if (key?.ctrl && key?.name === "c") {
    process.exit(0);
  }

  dispatch(key?.name);
  render();
});

function dispatch(key) {
  if (key === "q") process.exit(0);
  if (key === "r") {
    state = createInitialState();
    return;
  }
  if (key === "1") {
    state = applySectionCandidate(
      state,
      "legality",
      SAMPLE_CANDIDATES.validLegality,
      "Legality worker inserted country-level citations mid-sentence/sentence-end.",
    );
    return;
  }
  if (key === "2") {
    state = applySectionCandidate(
      state,
      "harm_potential",
      SAMPLE_CANDIDATES.invalidHarmRewrite,
      "Harm worker added a citation but also rewrote one word.",
    );
    return;
  }
  if (key === "3") {
    state = repairSectionCandidate(
      state,
      "harm_potential",
      SAMPLE_CANDIDATES.repairedHarm,
    );
    return;
  }
  if (key === "4") {
    state = archiveFailedSection(state, "harm_potential");
    return;
  }
  if (key === "5") {
    state = applyArticleWideCandidate(state, SAMPLE_CANDIDATES.articleWide);
    return;
  }
  if (key === "6") {
    state = applySectionCandidate(
      state,
      "summary",
      SAMPLE_CANDIDATES.malformedSummary,
      "Summary worker produced malformed marker syntax.",
    );
    return;
  }
  if (key === "7") {
    try {
      buildSectionPacket(state.article, "dosage");
      state.lastAction = "Unexpectedly built a dosage packet.";
    } catch (error) {
      state.lastAction = `Excluded-section packet rejected: ${error.message}`;
      state.lastValidation = {
        sectionKey: "dosage",
        ok: false,
        markerCount: 0,
        diagnostics: [{ code: "excluded_section", message: error.message }],
      };
    }
  }
}

function render() {
  console.clear();
  const summary = workflowSummary(state);
  const packet = buildArticleWidePacket(state);

  console.log(`${bold}Citation-only workflow prototype${reset}`);
  console.log(`${dim}Throwaway TUI. Question: does marker-only validation plus section-first/article-wide-last orchestration feel right?${reset}\n`);

  console.log(`${bold}Citable surface${reset}`);
  console.log(`  ${CITABLE_SECTIONS.join(", ")}`);
  console.log(`${dim}Excluded: ${EXCLUDED_SECTIONS.join(", ")}${reset}\n`);

  console.log(`${bold}Section states${reset}`);
  for (const sectionKey of CITABLE_SECTIONS) {
    console.log(`  ${sectionKey.padEnd(16)} ${formatStatus(state.sectionStatus[sectionKey])}`);
  }

  console.log(`\n${bold}Summary${reset}`);
  console.log(`  accepted sections: ${summary.acceptedSections.join(", ") || "none"}`);
  console.log(`  failed sections:   ${summary.failedSections.join(", ") || "none"}`);
  console.log(`  failure artifacts: ${summary.failureArtifacts}`);
  console.log(`  public markers:    ${summary.publicMarkerCount}`);
  console.log(`  article-wide pass: ${summary.articleWideStatus}`);

  console.log(`\n${bold}Article-wide packet preview${reset}`);
  console.log(`  failed section keys exposed: ${packet.failedSectionKeys.join(", ") || "none"}`);
  console.log(`  legality: ${truncate(packet.sections.legality)}`);
  console.log(`  harm:     ${truncate(packet.sections.harm_potential)}`);

  console.log(`\n${bold}Last action${reset}`);
  console.log(`  ${state.lastAction}`);

  if (state.lastValidation) {
    console.log(`\n${bold}Last validation${reset}`);
    console.log(`  section: ${state.lastValidation.sectionKey}`);
    console.log(`  result:  ${state.lastValidation.ok ? `${green}pass${reset}` : `${red}fail${reset}`}`);
    console.log(`  markers: ${state.lastValidation.markerCount}`);
    for (const diagnostic of state.lastValidation.diagnostics ?? []) {
      console.log(`  ${red}${diagnostic.code}${reset}: ${diagnostic.message}`);
    }
  }

  console.log(`\n${bold}Keys${reset}`);
  console.log(`  ${bold}1${reset} valid legality worker   ${bold}2${reset} invalid harm rewrite   ${bold}3${reset} repair harm`);
  console.log(`  ${bold}4${reset} archive harm failure    ${bold}5${reset} article-wide pass      ${bold}6${reset} malformed marker`);
  console.log(`  ${bold}7${reset} excluded dosage packet ${bold}r${reset} reset                  ${bold}q${reset} quit`);
}

function runDemo() {
  const steps = [
    ["initial", (current) => current],
    ["valid legality", (current) => applySectionCandidate(current, "legality", SAMPLE_CANDIDATES.validLegality, "demo")],
    ["invalid harm rewrite", (current) => applySectionCandidate(current, "harm_potential", SAMPLE_CANDIDATES.invalidHarmRewrite, "demo")],
    ["repair harm", (current) => repairSectionCandidate(current, "harm_potential", SAMPLE_CANDIDATES.repairedHarm)],
    ["article-wide pass", (current) => applyArticleWideCandidate(current, SAMPLE_CANDIDATES.articleWide)],
  ];

  let current = createInitialState();
  for (const [label, action] of steps) {
    current = action(current);
    console.log(`\n## ${label}`);
    console.log(JSON.stringify({
      summary: workflowSummary(current),
      lastValidation: current.lastValidation,
      articleWidePacket: buildArticleWidePacket(current),
    }, null, 2));
  }
}

function formatStatus(status) {
  if (status === "accepted") return `${green}${status}${reset}`;
  if (status === "failed") return `${red}${status}${reset}`;
  if (status === "archived_failed") return `${yellow}${status}${reset}`;
  return `${dim}${status}${reset}`;
}

function truncate(value) {
  const text = String(value ?? "");
  return text.length > 100 ? `${text.slice(0, 97)}...` : text;
}
