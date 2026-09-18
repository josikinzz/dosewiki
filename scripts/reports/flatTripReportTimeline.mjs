/**
 * Reshape a flat trip report body — one prose blob with the timestamps written
 * inline — into the corpus's standard record: `introduction`, the
 * `onset`/`peak`/`offset` timelines, and `conclusion`.
 *
 * Submitted reports arrive in whatever shape the author typed. Most of the 165
 * imported reports carry a real timeline, so a flat submission renders as a wall
 * of `introduction` with the phase rail empty. Reshaping it is pure text
 * movement, and this module exists to make that claim checkable rather than
 * asserted: `reconstructBody` is the exact inverse of `formatFlatBody` and reads
 * only the fields that reach Postgres, so a caller can prove the record still
 * spells the original body character for character before writing it.
 *
 * Anything that would make the proof impossible is refused, never normalized:
 *
 *   - a paragraph separator other than one blank line (`\n\n`),
 *   - a paragraph, or the body, with untrimmed edges — Postgres trims every
 *     editable field on write (`server/lib/tripReportEditing.ts`), so untrimmed
 *     text would silently change in storage,
 *   - a timestamp head not followed by exactly `": "`.
 *
 * The phase split and the conclusion boundary are editorial judgements, so they
 * arrive as an explicit plan rather than being guessed from the prose. Only the
 * mechanical parts — which paragraphs are timestamps, which paragraphs continue
 * the entry above them — are inferred here.
 */

const PARAGRAPH_SEPARATOR = "\n\n"

/** The separator a timestamp head uses before its narrative. */
const TIME_SEPARATOR = ": "

/**
 * A timestamp label as authors write them. Both corpus conventions are covered:
 * wall-clock (`9:48 PM`, `~8:40 PM`, `After 10:40 PM`) and elapsed (`T+0:25`).
 * Approximation markers and lead-in words stay part of the label, so the label
 * is always the author's own text.
 */
const TIME_LABEL_PATTERN =
  /^(?:~\s*)?(?:(?:After|Around|About|At|Approx\.?)\s+)?(?:\d{1,2}:\d{2}(?:\s*[ap]\.?\s?m\.?)?|T\+\S+)$/i;

/** Whether a paragraph opens a timeline entry, and the label if it does. */
export function readTimeHead(paragraph) {
  const separatorAt = paragraph.indexOf(TIME_SEPARATOR);
  if (separatorAt <= 0) {
    return null;
  }

  const label = paragraph.slice(0, separatorAt);
  if (label.includes("\n") || !TIME_LABEL_PATTERN.test(label)) {
    return null;
  }

  const description = paragraph.slice(separatorAt + TIME_SEPARATOR.length);
  return description ? { time: label, description } : null;
}

/**
 * Paragraphs of a body that is safe to reshape, or a throw naming the reason it
 * is not. Splitting on a fixed string is reversible by construction; the checks
 * here are what make the *rejoin after regrouping* reversible too.
 */
export function splitParagraphs(body) {
  if (typeof body !== "string" || !body) {
    throw new Error("Report body is empty; nothing to reshape.");
  }
  if (body !== body.trim()) {
    throw new Error("Report body has leading or trailing whitespace; Postgres would trim it away.");
  }

  const paragraphs = body.split(PARAGRAPH_SEPARATOR);

  paragraphs.forEach((paragraph, index) => {
    // An empty paragraph, or one whose edge is a newline, means the source
    // separated two paragraphs by more than one blank line. Regrouping would
    // rejoin them with exactly one, so the run is refused instead.
    if (!paragraph || /^\n|\n$/.test(paragraph)) {
      throw new Error(
        `Paragraph ${index + 1} is not separated by exactly one blank line; ` +
          "a wider gap cannot survive the round trip.",
      );
    }
    if (paragraph !== paragraph.trim()) {
      throw new Error(
        `Paragraph ${index + 1} has leading or trailing whitespace; Postgres would trim it away.`,
      );
    }
  });

  return paragraphs;
}

function locateUnique(paragraphs, prefix, label) {
  if (typeof prefix !== "string" || !prefix.trim()) {
    throw new Error(`Plan is missing ${label}.`);
  }

  const matches = [];
  paragraphs.forEach((paragraph, index) => {
    if (paragraph.startsWith(prefix)) {
      matches.push(index);
    }
  });

  if (matches.length === 0) {
    throw new Error(`Plan's ${label} (${JSON.stringify(prefix)}) matches no paragraph.`);
  }
  if (matches.length > 1) {
    throw new Error(
      `Plan's ${label} (${JSON.stringify(prefix)}) matches ${matches.length} paragraphs; make it unambiguous.`,
    );
  }
  return matches[0];
}

function phaseStartIndex(entries, label, phase) {
  if (typeof label !== "string" || !label.trim()) {
    throw new Error(`Plan is missing the ${phase} start timestamp.`);
  }

  const matches = entries.flatMap((entry, index) => (entry.time === label ? [index] : []));
  if (matches.length === 0) {
    throw new Error(`Plan's ${phase} start (${JSON.stringify(label)}) matches no timestamp.`);
  }
  if (matches.length > 1) {
    throw new Error(`Timestamp ${JSON.stringify(label)} appears ${matches.length} times; ${phase} start is ambiguous.`);
  }
  return matches[0];
}

/**
 * Group the timestamped span into entries. A paragraph without a timestamp
 * continues the entry above it — authors routinely break one moment across
 * several paragraphs — and is rejoined with the same blank line that separated
 * it, which `TimelineSection` renders as a paragraph break (`whitespace-pre-line`).
 */
function collectEntries(paragraphs, from, to) {
  const entries = [];

  for (let index = from; index < to; index += 1) {
    const paragraph = paragraphs[index];
    const head = readTimeHead(paragraph);

    if (head) {
      entries.push({ time: head.time, description: head.description });
      continue;
    }

    const current = entries[entries.length - 1];
    if (!current) {
      throw new Error(
        `Paragraph ${index + 1} precedes the first timestamp but sits inside the timeline span.`,
      );
    }
    current.description += PARAGRAPH_SEPARATOR + paragraph;
  }

  return entries;
}

/**
 * The standard record for a flat body, given the plan's editorial boundaries.
 *
 * @param {object} input
 * @param {string} input.body Flat report text, normally the submitted `introduction`.
 * @param {string} input.peakFrom Timestamp label that opens the peak.
 * @param {string} input.offsetFrom Timestamp label that opens the offset.
 * @param {string} input.conclusionFrom Prefix of the first closing-reflection paragraph.
 */
export function formatFlatBody({ body, peakFrom, offsetFrom, conclusionFrom }) {
  const paragraphs = splitParagraphs(body);

  const firstEntryIndex = paragraphs.findIndex((paragraph) => readTimeHead(paragraph) !== null);
  if (firstEntryIndex === -1) {
    throw new Error("Report body contains no timestamped paragraph; there is no timeline to split out.");
  }

  const conclusionIndex = locateUnique(paragraphs, conclusionFrom, "conclusion start");
  if (conclusionIndex <= firstEntryIndex) {
    throw new Error("Plan puts the conclusion before the first timestamp.");
  }

  const entries = collectEntries(paragraphs, firstEntryIndex, conclusionIndex);
  const peakAt = phaseStartIndex(entries, peakFrom, "peak");
  const offsetAt = phaseStartIndex(entries, offsetFrom, "offset");

  if (peakAt === 0) {
    throw new Error("Plan leaves the onset empty; the peak cannot start at the first timestamp.");
  }
  if (offsetAt <= peakAt) {
    throw new Error("Plan puts the offset start at or before the peak start.");
  }

  const record = {
    onset: entries.slice(0, peakAt),
    peak: entries.slice(peakAt, offsetAt),
    offset: entries.slice(offsetAt),
  };

  const introduction = paragraphs.slice(0, firstEntryIndex).join(PARAGRAPH_SEPARATOR);
  if (introduction) {
    record.introduction = introduction;
  }

  const conclusion = paragraphs.slice(conclusionIndex).join(PARAGRAPH_SEPARATOR);
  if (conclusion) {
    record.conclusion = conclusion;
  }

  return record;
}

/**
 * The original body, rebuilt from the reshaped record alone. Deliberately reads
 * nothing the write does not carry to Postgres, so equality with the source body
 * is real evidence that reshaping moved text without editing it.
 */
export function reconstructBody(record) {
  const blocks = [];

  if (record.introduction) {
    blocks.push(record.introduction);
  }

  for (const phase of ["onset", "peak", "offset"]) {
    for (const entry of record[phase] ?? []) {
      blocks.push(entry.time ? `${entry.time}${TIME_SEPARATOR}${entry.description}` : entry.description);
    }
  }

  if (record.conclusion) {
    blocks.push(record.conclusion);
  }

  return blocks.join(PARAGRAPH_SEPARATOR);
}

/** Index of the first differing character, or -1 when two strings are equal. */
export function firstDifferenceAt(left, right) {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    if (left[index] !== right[index]) {
      return index;
    }
  }
  return left.length === right.length ? -1 : shared;
}

/**
 * Throw unless the record reproduces the body exactly. The error quotes both
 * sides around the divergence, because "text changed" is only actionable when
 * the reviewer can see which character moved.
 */
export function assertLossless(body, record) {
  const rebuilt = reconstructBody(record);
  const at = firstDifferenceAt(body, rebuilt);

  if (at === -1) {
    return { characters: body.length };
  }

  const window = (text) => JSON.stringify(text.slice(Math.max(0, at - 60), at + 60));
  throw new Error(
    `Reshaped record does not reproduce the original body (first difference at character ${at}).\n` +
      `  original: ${window(body)}\n` +
      `  rebuilt:  ${window(rebuilt)}`,
  );
}

/** Entry counts and the timestamps in each phase, for a reviewable dry run. */
export function summarize(record) {
  return {
    introductionCharacters: record.introduction?.length ?? 0,
    conclusionCharacters: record.conclusion?.length ?? 0,
    phases: ["onset", "peak", "offset"].map((phase) => ({
      phase,
      entries: record[phase].length,
      times: record[phase].map((entry) => entry.time),
    })),
  };
}
