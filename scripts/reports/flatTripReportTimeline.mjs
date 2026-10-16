const PARAGRAPH_SEPARATOR = "\n\n"

const TIME_SEPARATOR = ": "

const TIME_LABEL_PATTERN =
  /^(?:~\s*)?(?:(?:After|Around|About|At|Approx\.?)\s+)?(?:\d{1,2}:\d{2}(?:\s*[ap]\.?\s?m\.?)?|T\+?\d{1,2}:\d{2}(?::\d{2})?)$/i;

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

export function splitParagraphs(body) {
  if (typeof body !== "string" || !body) {
    throw new Error("Report body is empty; nothing to reshape.");
  }
  if (body !== body.trim()) {
    throw new Error("Report body has leading or trailing whitespace; Postgres would trim it away.");
  }

  const paragraphs = body.split(PARAGRAPH_SEPARATOR);

  paragraphs.forEach((paragraph, index) => {
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

export function formatFlatBody({ body, peakFrom, offsetFrom, conclusionFrom }) {
  const paragraphs = splitParagraphs(body);

  const firstEntryIndex = paragraphs.findIndex((paragraph) => readTimeHead(paragraph) !== null);
  if (firstEntryIndex === -1) {
    throw new Error("Report body contains no timestamped paragraph; there is no timeline to split out.");
  }

  const conclusionIndex = conclusionFrom === null ? paragraphs.length : locateUnique(paragraphs, conclusionFrom, "conclusion start");
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

export function firstDifferenceAt(left, right) {
  const shared = Math.min(left.length, right.length);
  for (let index = 0; index < shared; index += 1) {
    if (left[index] !== right[index]) {
      return index;
    }
  }
  return left.length === right.length ? -1 : shared;
}

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
