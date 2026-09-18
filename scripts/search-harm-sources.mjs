#!/usr/bin/env node
/**
 * Search harm_potential sections for mentions of source names
 * Can read from local JSON or Postgres (--postgres flag)
 */
import fs from 'fs';
import { createDataClient } from "./lib/data-client.ts";
import { api } from '../lib/postgres/runtime/api.ts';
import { getAllSubstanceDocuments } from './lib/data-pagination.mjs';

const usePostgres = process.argv.includes('--postgres');
let articles;

if (usePostgres) {
  const { client, fingerprint } = createDataClient();
  console.log(`Fetching from Postgres: ${fingerprint}\n`);
  articles = await getAllSubstanceDocuments(client, api.substanceIndex.getFullDocumentPage);
} else {
  articles = JSON.parse(fs.readFileSync('public/SubstanceIndex.json', 'utf-8'));
}

// Source name patterns (case insensitive)
const sourcePatterns = [
  { name: 'Wikipedia', pattern: /wikipedia/i },
  { name: 'PsychonautWiki', pattern: /psychonautwiki/i },
  { name: 'Erowid', pattern: /erowid/i },
  { name: 'TripSit', pattern: /tripsit/i },
  { name: 'Bluelight', pattern: /bluelight/i },
  { name: 'PubMed', pattern: /pubmed/i },
  { name: 'NCBI', pattern: /ncbi/i },
  { name: 'DEIS', pattern: /disregard everything i say/i },
  { name: 'DEIS (abbrev)', pattern: /\bdeis\b/i },
  { name: 'DrugBank', pattern: /drugbank/i },
  { name: 'Examine', pattern: /examine\.com/i },
  { name: 'Reddit', pattern: /reddit/i },
  { name: 'source meta-commentary', pattern: /\bsource(?:s)?\s+(?:do(?:es)?(?:n'?t)?|did(?:n'?t)?|indicate|mention|describe|report|state|suggest|show|provide|document|available|unavailable|lack|limited|insufficient)/i },
  { name: 'data availability', pattern: /(?:no|limited|insufficient|lacking)\s+(?:data|information|evidence|documentation)\s+(?:in|from|available)/i },
  { name: 'not documented', pattern: /not\s+(?:well\s+)?(?:documented|characterized|described|studied)\s+(?:in|by|from)/i },
  { name: 'according to sources', pattern: /(?:according to|per|from)\s+(?:the\s+)?(?:available\s+)?sources/i },
  { name: 'in sources', pattern: /\bin\s+(?:available\s+)?sources\b/i },
  { name: 'the sources', pattern: /\bthe\s+sources\b/i },
];

const issues = [];

for (const article of articles) {
  if (!article.harm_potential) continue;

  const articleName = article.slug || article.title;
  const hp = article.harm_potential;

  // Collect all text fields from harm_potential
  const fields = [];

  const addField = (path, value) => {
    if (value && typeof value === 'string' && value.trim()) {
      fields.push({ path, value });
    }
  };

  // Addiction
  if (hp.addiction) {
    if (hp.addiction.psychological) {
      addField('addiction.psychological.description', hp.addiction.psychological.description);
    }
    if (hp.addiction.physical_dependence) {
      addField('addiction.physical_dependence.description', hp.addiction.physical_dependence.description);
    }
  }

  // Toxicity
  if (hp.toxicity) {
    if (hp.toxicity.lethal_dosage) {
      addField('toxicity.lethal_dosage.notes', hp.toxicity.lethal_dosage.notes);
    }
    if (hp.toxicity.carcinogenicity) {
      addField('toxicity.carcinogenicity.description', hp.toxicity.carcinogenicity.description);
    }
    if (hp.toxicity.antibiotic_function) {
      addField('toxicity.antibiotic_function.description', hp.toxicity.antibiotic_function.description);
    }

    // Organ toxicity entries
    if (hp.toxicity.organ_toxicity) {
      hp.toxicity.organ_toxicity.forEach((entry, i) => {
        addField(`toxicity.organ_toxicity[${i}].findings`, entry.findings);
        addField(`toxicity.organ_toxicity[${i}].mechanism`, entry.mechanism);
        addField(`toxicity.organ_toxicity[${i}].notes`, entry.notes);
      });
    }
  }

  // Psychosis & Seizure
  if (hp.psychosis) {
    addField('psychosis.description', hp.psychosis.description);
  }
  if (hp.seizure) {
    addField('seizure.description', hp.seizure.description);
  }

  // Check each field against patterns
  for (const { path, value } of fields) {
    for (const { name, pattern } of sourcePatterns) {
      const match = value.match(pattern);
      if (match) {
        issues.push({
          slug: articleName,
          field: path,
          patternName: name,
          match: match[0],
          context: value.substring(Math.max(0, match.index - 30), match.index + match[0].length + 50)
        });
      }
    }
  }
}

console.log(`Found ${issues.length} potential source mentions in harm_potential sections\n`);

if (issues.length === 0) {
  console.log('✅ No source mentions found!');
  process.exit(0);
}

// Group by article
const byArticle = {};
for (const issue of issues) {
  if (!byArticle[issue.slug]) byArticle[issue.slug] = [];
  byArticle[issue.slug].push(issue);
}

console.log(`Affected articles: ${Object.keys(byArticle).length}\n`);
console.log('='.repeat(80));

for (const [slug, articleIssues] of Object.entries(byArticle)) {
  console.log(`\n📄 ${slug}:`);
  for (const issue of articleIssues) {
    console.log(`   [${issue.field}]`);
    console.log(`   Pattern: ${issue.patternName}`);
    console.log(`   Match: "${issue.match}"`);
    console.log(`   Context: "...${issue.context}..."`);
    console.log('');
  }
}
issue.match}"`);
    console.log(`   Context: "...${issue.context}..."`);
    console.log('');
  }
}
