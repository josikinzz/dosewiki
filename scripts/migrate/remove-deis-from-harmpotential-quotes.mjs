#!/usr/bin/env node
/**
 * Remove "Disregard Everything I Say" sections from harm potential quote files.
 *
 * The DEIS source contains speculative LD50 extrapolations that shouldn't be used
 * for lethal dosage data in harm reduction documentation.
 *
 * Usage:
 *   node scripts/migrate/remove-deis-from-harmpotential-quotes.mjs [--dry-run]
 */

import { readdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');
const QUOTES_DIR = join(PROJECT_ROOT, 'quotes/harmpotential-quotes');

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Remove the "Disregard Everything I Say" section from a quote file.
 * Sections are delimited by `---` and start with `## Source: Disregard Everything I Say`
 */
function removeDEISSection(content) {
  // Pattern to match the DEIS section:
  // Starts with "## Source: Disregard Everything I Say"
  // Ends at the next "---" or end of file
  const deisPattern = /\n---\n\n## Source: Disregard Everything I Say[\s\S]*?(?=\n---\n|$)/g;

  const newContent = content.replace(deisPattern, '');

  // Also try without the leading separator (in case it's the last section)
  const altPattern = /## Source: Disregard Everything I Say[\s\S]*?(?=\n---\n|$)/g;

  return newContent.replace(altPattern, '');
}

async function main() {
  console.log('Remove DEIS sections from harm potential quote files');
  console.log('====================================================');
  if (DRY_RUN) {
    console.log('DRY RUN - no files will be modified\n');
  }

  const files = await readdir(QUOTES_DIR);
  const mdFiles = files.filter(f => f.endsWith('.md'));

  console.log(`Found ${mdFiles.length} quote files\n`);

  let modified = 0;
  let unchanged = 0;
  let errors = 0;

  for (const file of mdFiles) {
    const filePath = join(QUOTES_DIR, file);

    try {
      const content = await readFile(filePath, 'utf-8');

      // Check if file contains DEIS section
      if (!content.includes('## Source: Disregard Everything I Say')) {
        unchanged++;
        continue;
      }

      const newContent = removeDEISSection(content);

      if (newContent !== content) {
        if (!DRY_RUN) {
          await writeFile(filePath, newContent, 'utf-8');
        }
        modified++;
        console.log(`  ${DRY_RUN ? '[would modify]' : '[modified]'} ${file}`);
      } else {
        unchanged++;
      }
    } catch (err) {
      console.error(`  [error] ${file}: ${err.message}`);
      errors++;
    }
  }

  console.log('\n====================================================');
  console.log(`Results:`);
  console.log(`  Modified: ${modified}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  Errors: ${errors}`);

  if (DRY_RUN && modified > 0) {
    console.log('\nRun without --dry-run to apply changes.');
  }
}

main().catch(console.error);
