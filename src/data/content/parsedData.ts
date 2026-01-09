import sourceCoverageMarkdown from "./source-coverage-summary.md?raw";

export const parsedDataMarkdown = sourceCoverageMarkdown.replace(/\r\n/g, "\n").trim();
