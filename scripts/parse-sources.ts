#!/usr/bin/env npx tsx

import { runParseSourcesCli } from "./parse-sources-cli";
import { ParseSourceCorpusError } from "./parsers/index";

runParseSourcesCli().catch((error: unknown) => {
  if (error instanceof ParseSourceCorpusError && error.code === "SUBSTANCE_NOT_FOUND") {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
