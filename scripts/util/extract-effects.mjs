import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the SubstanceIndex.json file
const articlesPath = path.join(__dirname, '../..', 'src', 'data', 'SubstanceIndex.json');
const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf-8'));

// Sets to store unique effects by category
const effectsByCategory = {
  visual: new Set(),
  auditory: new Set(),
  tactile: new Set(),
  olfactory: new Set(),
  gustatory: new Set(),
  multisensory: new Set(),
  cognitive: new Set(),
  physical: new Set(),
};

// Helper to add effects from an array
function addEffects(effects, targetSet) {
  if (Array.isArray(effects)) {
    effects.forEach(effect => {
      if (typeof effect === 'string' && effect.trim()) {
        targetSet.add(effect.trim());
      }
    });
  }
}

// Extract effects from all substances using SubstanceArticle schema
Object.values(articles).forEach(article => {
  const subjective = article?.subjective_effects;
  if (!subjective) return;

  // Sensory effects
  const sensory = subjective.sensory || {};
  addEffects(sensory.visual, effectsByCategory.visual);
  addEffects(sensory.auditory, effectsByCategory.auditory);
  addEffects(sensory.tactile, effectsByCategory.tactile);
  addEffects(sensory.olfactory, effectsByCategory.olfactory);
  addEffects(sensory.gustatory, effectsByCategory.gustatory);
  addEffects(sensory.multisensory, effectsByCategory.multisensory);

  // Cognitive and physical effects
  addEffects(subjective.cognitive, effectsByCategory.cognitive);
  addEffects(subjective.physical, effectsByCategory.physical);
});

// Collect all unique effects
const allEffectsSet = new Set();
Object.values(effectsByCategory).forEach(set => {
  set.forEach(effect => allEffectsSet.add(effect));
});

// Convert to array and sort alphabetically
const sortedEffects = Array.from(allEffectsSet).sort((a, b) =>
  a.toLowerCase().localeCompare(b.toLowerCase())
);

// Create markdown content
let markdown = '# All Individual Effects\n\n';
markdown += `Total unique effects: ${sortedEffects.length}\n\n`;

// Add category breakdowns
const categoryLabels = {
  visual: 'Visual',
  auditory: 'Auditory',
  tactile: 'Tactile',
  olfactory: 'Olfactory',
  gustatory: 'Gustatory',
  multisensory: 'Multisensory',
  cognitive: 'Cognitive',
  physical: 'Physical',
};

markdown += '## Effects by Category\n\n';
for (const [key, label] of Object.entries(categoryLabels)) {
  const effects = Array.from(effectsByCategory[key]).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
  if (effects.length > 0) {
    markdown += `### ${label} (${effects.length})\n\n`;
    effects.forEach(effect => {
      markdown += `- ${effect}\n`;
    });
    markdown += '\n';
  }
}

markdown += '## All Effects (Alphabetical)\n\n';
sortedEffects.forEach(effect => {
  markdown += `- ${effect}\n`;
});

// Ensure the output directory exists
const outputDir = path.join(__dirname, '../..', 'notes and plans');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Write to file
const outputPath = path.join(outputDir, 'all-effects.md');
fs.writeFileSync(outputPath, markdown, 'utf-8');

console.log(`✓ Extracted ${sortedEffects.length} unique effects`);
console.log(`✓ By category:`);
for (const [key, label] of Object.entries(categoryLabels)) {
  const count = effectsByCategory[key].size;
  if (count > 0) {
    console.log(`  - ${label}: ${count}`);
  }
}
console.log(`✓ Saved to: ${outputPath}`);
