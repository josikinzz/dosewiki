import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the articles.json file
const articlesPath = path.join(__dirname, '..', 'src', 'data', 'articles.json');
const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf-8'));

// Set to store unique effects
const effectsSet = new Set();

// Extract effects from all substances
Object.values(articles).forEach(article => {
  // Check for subjective_effects in drug_info
  if (article.drug_info && article.drug_info.subjective_effects && Array.isArray(article.drug_info.subjective_effects)) {
    article.drug_info.subjective_effects.forEach(effect => {
      if (typeof effect === 'string') {
        effectsSet.add(effect);
      }
    });
  }
});

// Convert to array and sort alphabetically
const sortedEffects = Array.from(effectsSet).sort((a, b) => 
  a.toLowerCase().localeCompare(b.toLowerCase())
);

// Create markdown content
let markdown = '# All Individual Effects\n\n';
markdown += `Total unique effects: ${sortedEffects.length}\n\n`;
markdown += '## Effects List (Alphabetical)\n\n';
sortedEffects.forEach(effect => {
  markdown += `- ${effect}\n`;
});

// Ensure the output directory exists
const outputDir = path.join(__dirname, '..', 'notes and plans');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Write to file
const outputPath = path.join(outputDir, 'all-effects.md');
fs.writeFileSync(outputPath, markdown, 'utf-8');

console.log(`✓ Extracted ${sortedEffects.length} unique effects`);
console.log(`✓ Saved to: ${outputPath}`);