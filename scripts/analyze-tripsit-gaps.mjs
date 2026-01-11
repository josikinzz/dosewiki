import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Load parsed sources
const parsed = JSON.parse(fs.readFileSync(path.join(rootDir, 'src/data/parsed-sources.json'), 'utf-8'));

// Get all article source files
const sourcesDir = path.join(rootDir, 'src/data/article-sources');
const files = fs.readdirSync(sourcesDir).filter(f => f.endsWith('.ts'));

const results = {
  total: 0,
  withTripSit: 0,
  dosage: { parsed: 0, noSection: 0, labelsOnly: 0, hasData: 0 },
  duration: { parsed: 0, noSection: 0, labelsOnly: 0, hasData: 0 },
  gaps: { dosage: [], duration: [] }
};

// Priority substances to flag
const prioritySubstances = new Set([
  'lsd', 'mdma', 'psilocybin-mushrooms', 'cocaine', 'cannabis', 'ketamine',
  'amphetamine', 'methamphetamine', 'dmt', '2c-b', 'ghb', 'alcohol',
  'heroin', 'morphine', 'codeine', 'oxycodone', 'diazepam', 'alprazolam',
  'clonazepam', 'nitrous', 'dextromethorphan', 'kratom', 'salvia', 'mescaline'
]);

for (const file of files) {
  const slug = file.replace('.ts', '');
  const content = fs.readFileSync(path.join(sourcesDir, file), 'utf-8');

  // Extract tripsit-factsheets content
  const match = content.match(/"tripsit-factsheets":\s*`([\s\S]*?)`/);
  if (!match) continue;

  results.total++;
  results.withTripSit++;

  const tripSitContent = match[1];
  const parsedSubstance = parsed.substances[slug] || {};

  // Check dosage - look for ## Dosage section and numeric values
  const hasDosageSection = /##\s*Dosage/i.test(tripSitContent);

  // Extract only the dosage section for analysis
  const dosageSectionMatch = tripSitContent.match(/##\s*Dosage\s*([\s\S]*?)(?=\n##|$)/i);
  const dosageSection = dosageSectionMatch ? dosageSectionMatch[1] : '';

  // Look for dosage tier patterns with numbers ONLY within the dosage section
  const hasDosageNumbers = hasDosageSection && (
    /(?:Threshold|Light|Common|Moderate|Strong|Heavy)[:\s]*\**\s*[\d.]+/i.test(dosageSection) ||
    /-\s*\*\*(?:Threshold|Light|Common|Moderate|Strong|Heavy)[:\s]*\*\*\s*[\d.]+/i.test(dosageSection)
  );
  const hasParsedDosage = parsedSubstance.dosage && parsedSubstance.dosage.length > 0;

  if (hasParsedDosage) {
    results.dosage.parsed++;
  } else if (!hasDosageSection) {
    results.dosage.noSection++;
  } else if (hasDosageSection && !hasDosageNumbers) {
    results.dosage.labelsOnly++;
  } else if (hasDosageNumbers && !hasParsedDosage) {
    results.dosage.hasData++;
    // Get snippet
    const lines = tripSitContent.split('\n');
    let snippet = '';
    for (const line of lines) {
      if (/(?:Threshold|Light|Common|Moderate|Strong|Heavy)[:\s]*\**/i.test(line) && /\d/.test(line)) {
        snippet = line.trim().substring(0, 100);
        break;
      }
    }
    results.gaps.dosage.push({
      slug,
      snippet,
      priority: prioritySubstances.has(slug)
    });
  }

  // Check duration
  const hasDurationSection = /##\s*Duration/i.test(tripSitContent);
  const hasDurationNumbers = /(?:Onset|Duration|Peak|Come[-\s]?up|Offset|After)[:\s]*\**\s*[\d.]+/i.test(tripSitContent) ||
                            /-\s*\*\*(?:Onset|Duration|Peak)[:\s]*\*\*\s*[\d.]+/i.test(tripSitContent);
  const hasParsedDuration = parsedSubstance.duration && parsedSubstance.duration.length > 0;

  if (hasParsedDuration) {
    results.duration.parsed++;
  } else if (!hasDurationSection && !hasDurationNumbers) {
    results.duration.noSection++;
  } else if (hasDurationSection && !hasDurationNumbers) {
    results.duration.labelsOnly++;
  } else if (hasDurationNumbers && !hasParsedDuration) {
    results.duration.hasData++;
    const lines = tripSitContent.split('\n');
    let snippet = '';
    for (const line of lines) {
      if (/(?:Onset|Duration|Peak|Come[-\s]?up)/i.test(line) && /\d/.test(line)) {
        snippet = line.trim().substring(0, 100);
        break;
      }
    }
    results.gaps.duration.push({
      slug,
      snippet,
      priority: prioritySubstances.has(slug)
    });
  }
}

// Sort gaps with priority first
results.gaps.dosage.sort((a, b) => b.priority - a.priority);
results.gaps.duration.sort((a, b) => b.priority - a.priority);

console.log(JSON.stringify(results, null, 2));
