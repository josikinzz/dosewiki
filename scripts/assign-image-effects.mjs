#!/usr/bin/env node
/**
 * Automatically assign effect_slug to images using esei-replications-index.json
 *
 * This script:
 * 1. Reads esei-replications-index.json for image-to-effect mappings
 * 2. Maps ESEI effect names to DoseWiki effect slugs
 * 3. Updates replications-metadata.json with correct effect_slug for each image
 *
 * Usage:
 *   node scripts/assign-image-effects.mjs
 *
 * Output:
 *   Updates replications-metadata.json in-place
 *   Shows summary of assignments
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Paths
const EI_INDEX_FILE = '/Users/josie/Documents/Utilities/unified osmanthus app/replications/esei-replications-index.json';
const METADATA_FILE = path.join(__dirname, '..', 'replications-metadata.json');

// Effect mapping: ESEI effect names → DoseWiki effect slugs
const ESEI_TO_DOSEWIKI_EFFECTS = {
  'After images': 'tracers',
  'Aesthetic distillation': 'aesthetic-distillation',
  'Akinetopsia': 'akinetopsia',
  'Autonomous entities': 'hallucinatory-entities',
  'Blurred vision': 'blurred-vision',
  'Breathing': 'breathing',
  'Chromatic aberration': 'chromatic-aberration',
  'Closed eye visuals': 'closed-eye-visuals',
  'Color enhancement': 'color-enhancement',
  'Color flashes': 'color-transformation',
  'Color modulation': 'color-modulation',
  'Color shifting': 'color-transformation',
  'Color transformation': 'color-transformation',
  'Depersonalization': 'depersonalization',
  'Diffraction': 'diffraction-spikes',
  'Diffraction spikes': 'diffraction-spikes',
  'Double vision': 'double-vision',
  'Environmental cubism': 'environmental-cubism',
  'External hallucinations': 'external-hallucinations',
  'Flowing': 'melting',
  'Geometry': 'visual-geometry',
  'Hallucinatory entity': 'hallucinatory-entities',
  'Hallucinatory entities': 'hallucinatory-entities',
  'Hallucinatory visual acuity': 'hallucinatory-visual-acuity',
  'Immersive hallucinations': 'immersive-hallucinations',
  'Increased pareidolia': 'increased-pareidolia',
  'Internal hallucinations': 'internal-hallucinations',
  'Loss of Contact with Reality': 'loss-of-contact-with-reality',
  'Machinescapes': 'machinescapes',
  'Melting': 'melting',
  'Motion': 'visual-drifting',
  'Object activation': 'object-activation',
  'Open eye visuals': 'open-eye-visuals',
  'Peripheral pareidolia': 'peripheral-pareidolia',
  'Recursion': 'recursion',
  'Scenery slicing': 'scenery-slicing',
  'Selective strobing': 'visual-distortions',
  'Shadow people': 'hallucinatory-entities',
  'Size distortion': 'visual-distortions',
  'Symmetrical texture repetition': 'symmetrical-texture-repetition',
  'Tachypsychia': 'visual-distortions',
  'Trails': 'tracers',
  'Tracers': 'tracers',
  'Transformation': 'visual-distortions',
  'Unspeakable horrors': 'hallucinatory-entities',
  'Visual acuity enhancement': 'visual-acuity-enhancement',
  'Visual amplifications': 'visual-acuity-enhancement',
  'Visual Distortions': 'visual-distortions',
  'Visual distortions': 'visual-distortions',
  'Visual drifting': 'visual-drifting',
  'Visual geometry': 'visual-geometry',
  'Visual recursion': 'recursion',
  'Visual swirling': 'visual-distortions',
  'Visual trails': 'tracers',
};

/**
 * Normalize filename for comparison (case-insensitive, handle slight variations)
 */
function normalizeFilename(filename) {
  return filename.toLowerCase().trim();
}

/**
 * Main function to assign effects to images
 */
function assignImageEffects() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('Assign Image Effects');
  console.log(`${'='.repeat(60)}\n`);

  // Load EI index
  if (!fs.existsSync(EI_INDEX_FILE)) {
    console.error(`Error: EI index file not found: ${EI_INDEX_FILE}`);
    process.exit(1);
  }

  const eiIndex = JSON.parse(fs.readFileSync(EI_INDEX_FILE, 'utf-8'));

  // Build filename → effect mapping from EI index
  const imageEffectMap = {};
  for (const [eseiEffect, data] of Object.entries(eiIndex.eseiEffects)) {
    const dosewikiSlug = ESEI_TO_DOSEWIKI_EFFECTS[eseiEffect];
    if (!dosewikiSlug) {
      console.warn(`Warning: No DoseWiki mapping for ESEI effect: ${eseiEffect}`);
      continue;
    }

    for (const rep of data.replications || []) {
      if (rep.type === 'image' && rep.filename) {
        const normalized = normalizeFilename(rep.filename);
        imageEffectMap[normalized] = {
          dosewikiSlug,
          eseiEffect,
          title: rep.title,
          artist: rep.artist,
        };
      }
    }
  }

  console.log(`Loaded ${Object.keys(imageEffectMap).size} image-effect mappings from EI index\n`);

  // Load metadata
  if (!fs.existsSync(METADATA_FILE)) {
    console.error(`Error: Metadata file not found: ${METADATA_FILE}`);
    process.exit(1);
  }

  const metadata = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));

  // Assign effects to images
  let assigned = 0;
  let alreadyAssigned = 0;
  let notFound = 0;
  const notFoundImages = [];
  const assignments = [];

  for (const rep of metadata.replications) {
    if (rep.type !== 'image') continue;

    if (rep.effect_slug) {
      alreadyAssigned++;
      continue;
    }

    const normalized = normalizeFilename(rep.filename);
    const mapping = imageEffectMap[normalized];

    if (mapping) {
      rep.effect_slug = mapping.dosewikiSlug;
      rep.ei_effect = mapping.eseiEffect;
      assigned++;
      assignments.push({
        filename: rep.filename,
        effect_slug: mapping.dosewikiSlug,
        title: mapping.title,
        artist: mapping.artist,
      });
    } else {
      notFound++;
      notFoundImages.push(rep.filename);
    }
  }

  // Write updated metadata
  fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));

  // Report results
  console.log(`${'='.repeat(60)}`);
  console.log('Assignment Results');
  console.log(`${'='.repeat(60)}`);
  console.log(`Newly assigned: ${assigned}`);
  console.log(`Already assigned: ${alreadyAssigned}`);
  console.log(`Not found in EI index: ${notFound}`);

  if (assignments.length > 0) {
    console.log(`\nFirst 20 assignments:`);
    assignments.slice(0, 20).forEach(a => {
      console.log(`  ${a.filename.padEnd(40)} → ${a.effect_slug}`);
    });
    if (assignments.length > 20) {
      console.log(`  ... and ${assignments.length - 20} more\n`);
    }
  }

  if (notFoundImages.length > 0) {
    console.log(`\nImages not in EI index (require manual assignment):`);
    notFoundImages.slice(0, 20).forEach(filename => {
      console.log(`  - ${filename}`);
    });
    if (notFoundImages.length > 20) {
      console.log(`  ... and ${notFoundImages.length - 20} more\n`);
    }
  }

  // Summary by effect
  console.log(`\nImages by assigned effect:`);
  const byEffect = {};
  for (const rep of metadata.replications) {
    if (rep.type === 'image' && rep.effect_slug) {
      if (!byEffect[rep.effect_slug]) {
        byEffect[rep.effect_slug] = 0;
      }
      byEffect[rep.effect_slug]++;
    }
  }

  Object.entries(byEffect)
    .sort((a, b) => b[1] - a[1])
    .forEach(([effect, count]) => {
      console.log(`  ${effect}: ${count}`);
    });

  console.log(`\nTotal images with effect_slug: ${
    metadata.replications.filter(r => r.type === 'image' && r.effect_slug).length
  } / ${metadata.replications.filter(r => r.type === 'image').length}`);

  console.log(`\n✓ Updated ${METADATA_FILE}`);
  console.log(`${'='.repeat(60)}\n`);
}

// Run
assignImageEffects();
