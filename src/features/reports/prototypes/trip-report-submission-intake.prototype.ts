/*
 * PROTOTYPE - throwaway terminal driver for trip report submission intake.
 *
 * Run with:
 *   npm run prototype:trip-report-submissions
 */

import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  createInitialIntakeState,
  getSelectedSubmission,
  makeInvalidSubmission,
  makeSampleSubmission,
  previewAcceptedSubmissionPromotion,
  selectSubmission,
  submitTripReport,
  summarizeQueue,
  transitionSubmission,
  type IntakeState,
  type SubmissionFormInput,
  type TripReportDraft,
} from "./trip-report-submission-intake.logic.prototype";

const bold = "\x1b[1m";
const dim = "\x1b[2m";
const reset = "\x1b[0m";
const clear = "\x1b[2J\x1b[H";
const reviewer = "prototype-editor@example.com";

const rl = readline.createInterface({ input, output });
const state = createInitialIntakeState();

async function main() {
  while (true) {
    renderFrame(state);
    const command = (await rl.question("> ")).trim().toLowerCase();

    if (command === "q") {
      break;
    }

    await handleCommand(command);
  }

  rl.close();
}

async function handleCommand(command: string) {
  switch (command) {
    case "s":
      submitTripReport(state, makeSampleSubmission());
      return;
    case "h":
      submitTripReport(state, makeSampleSubmission({ honeypot: "buy now" }));
      return;
    case "i":
      submitTripReport(state, makeInvalidSubmission());
      return;
    case "c":
      submitTripReport(state, await promptCustomSubmission());
      return;
    case "v":
      selectSubmission(state, await askSubmissionId());
      return;
    case "r":
      transitionSubmission(state, await askSubmissionId(), "reviewing", reviewer, "Prototype review started.");
      return;
    case "a":
      transitionSubmission(state, await askSubmissionId(), "accepted", reviewer, "Looks suitable for later Postgres promotion.");
      return;
    case "j":
      transitionSubmission(state, await askSubmissionId(), "rejected", reviewer, "Rejected in prototype.");
      return;
    case "m":
      transitionSubmission(state, await askSubmissionId(), "spam", reviewer, "Marked spam in prototype.");
      return;
    case "x":
      previewAcceptedSubmissionPromotion(state, await askSubmissionId());
      return;
    case "e":
      state.lastResult = "Publishing is handled by the production Postgres promotion mutation, not this prototype.";
      return;
    default:
      state.lastResult = "Unknown command. Use one of the shortcuts below.";
  }
}

function renderFrame(current: IntakeState) {
  const counts = summarizeQueue(current);
  const selected = getSelectedSubmission(current);

  output.write(clear);
  output.write(`${bold}Trip Report Submission Intake Prototype${reset}\n`);
  output.write(`${dim}Throwaway model for private Postgres intake before public trip report promotion.${reset}\n\n`);

  output.write(`${bold}Queue${reset}\n`);
  output.write(`total: ${current.submissions.length}\n`);
  output.write(
    `submitted: ${counts.submitted}  reviewing: ${counts.reviewing}  accepted: ${counts.accepted}  rejected: ${counts.rejected}  spam: ${counts.spam}  exported: ${counts.exported}\n\n`,
  );

  output.write(`${bold}Rows${reset}\n`);
  if (current.submissions.length === 0) {
    output.write(`${dim}No submissions yet.${reset}\n`);
  } else {
    for (const row of current.submissions.slice(0, 8)) {
      const selectedMarker = row.id === current.selectedId ? "*" : " ";
      output.write(
        `${selectedMarker} ${row.id} | ${row.status.padEnd(9)} | ${row.title} | ${row.substance_names.join(", ")}\n`,
      );
    }
  }

  output.write(`\n${bold}Selected${reset}\n`);
  output.write(`${formatSelected(selected)}\n`);

  output.write(`${bold}Last promotion preview${reset}\n`);
  output.write(`${current.lastPromotionPreview ? JSON.stringify(current.lastPromotionPreview, null, 2) : dim + "No promotion preview built yet." + reset}\n\n`);

  output.write(`${bold}Last result${reset}\n`);
  output.write(`${current.lastResult}\n\n`);

  output.write(`${bold}Shortcuts${reset}\n`);
  output.write("[s] sample  [c] custom  [h] honeypot spam  [i] invalid\n");
  output.write("[v] view/select  [r] reviewing  [a] accept  [j] reject  [m] spam\n");
  output.write("[x] preview promotion payload  [e] publish note  [q] quit\n");
}

function formatSelected(row: ReturnType<typeof getSelectedSubmission>): string {
  if (!row) {
    return `${dim}No selected row. Submit or view a row first.${reset}\n`;
  }

  return JSON.stringify(
    {
      id: row.id,
      status: row.status,
      title: row.title,
      author_name: row.author_name,
      substance_names: row.substance_names,
      contact_email: row.contact_email,
      may_contact: row.may_contact,
      publish_consent: row.publish_consent,
      age_confirmed: row.age_confirmed,
      ip_hash: row.ip_hash,
      honeypot_triggered: row.honeypot_triggered,
      reviewed_by: row.reviewed_by,
      review_notes: row.review_notes,
      report: row.report,
    },
    null,
    2,
  );
}

async function askSubmissionId(): Promise<string> {
  const selected = getSelectedSubmission(state);
  const answer = await rl.question(`submission id${selected ? ` (${selected.id})` : ""}: `);
  return answer.trim() || selected?.id || "";
}

async function promptCustomSubmission(): Promise<SubmissionFormInput> {
  const title = await rl.question("title: ");
  const author = await rl.question("author/display name (blank = Anonymous): ");
  const substanceName = await rl.question("substance name: ");
  const dose = await rl.question("dose: ");
  const roa = await rl.question("route of administration: ");
  const introduction = await rl.question("introduction: ");
  const peak = await rl.question("peak narrative: ");
  const conclusion = await rl.question("conclusion: ");
  const contactEmail = await rl.question("contact email (optional): ");

  const report: TripReportDraft = {
    title,
    subject: {
      name: author || "Anonymous",
      setting: "custom prototype submission",
    },
    substances: [{ name: substanceName, dose, roa }],
    introduction,
    onset: [],
    peak: [{ description: peak }],
    offset: [],
    conclusion,
    tags: [],
  };

  return {
    report,
    contact_email: contactEmail,
    may_contact: contactEmail.trim().length > 0,
    publish_consent: true,
    age_confirmed: true,
    honeypot: "",
    ip: "198.51.100.20",
    user_agent: "prototype-cli-custom",
  };
}

main().catch((error) => {
  rl.close();
  console.error(error);
  process.exitCode = 1;
});
