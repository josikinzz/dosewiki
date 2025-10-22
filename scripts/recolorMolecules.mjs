import { promises as fs } from 'fs';
import path from 'path';

const root = process.cwd();
const directories = ['molecule svg dataset', 'public/molecules'];

const mappings = [
  {
    target: '#f5d0fe',
    patterns: [/#000000/gi, /\bblack\b/gi]
  },
  {
    target: '#c4b5fd',
    patterns: [/#333399/gi, /rgb\(\s*51\s*,\s*51\s*,\s*153\s*\)/gi]
  },
  {
    target: '#fda4af',
    patterns: [/#ff0000/gi, /\bred\b/gi]
  },
  {
    target: '#eef2ff',
    patterns: [/#ffffff(?![0-9a-fA-F]{2})/gi, /\bwhite\b/gi]
  },
  {
    target: '#fbbf24',
    patterns: [/#996600/gi]
  },
  {
    target: '#bef264',
    patterns: [/#666600/gi]
  },
  {
    target: '#6ee7b7',
    patterns: [/#009900/gi]
  },
  {
    target: '#ffffff99',
    patterns: [/#333333/gi]
  },
  {
    target: '#e879f9',
    patterns: [/#660099/gi]
  },
  {
    target: '#fb7185',
    patterns: [/#663333/gi, /#ec0000/gi]
  },
  {
    target: '#fcd34dcc',
    patterns: [/#666633/gi]
  },
  {
    target: '#f43f5e',
    patterns: [/#660000/gi]
  },
  {
    target: '#a5b4fc',
    patterns: [/#0000ff/gi]
  }
];

const summaries = [];

async function loadFiles(dir) {
  const absDir = path.join(root, dir);
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) continue;
    if (!entry.name.toLowerCase().endsWith('.svg')) continue;
    await recolorFile(path.join(absDir, entry.name));
  }
}

async function recolorFile(filePath) {
  const original = await fs.readFile(filePath, 'utf8');
  let updated = original;
  let changed = false;

  for (const mapping of mappings) {
    const normalizedTarget = mapping.target.toLowerCase();
    for (const pattern of mapping.patterns) {
      updated = updated.replace(pattern, match => {
        const isAlreadyTarget = match.toLowerCase() === normalizedTarget;
        if (!isAlreadyTarget) {
          changed = true;
        }
        return mapping.target;
      });
    }
  }

  if (changed) {
    await fs.writeFile(filePath, updated, 'utf8');
    summaries.push(filePath);
  }
}

(async () => {
  for (const dir of directories) {
    try {
      await loadFiles(dir);
    } catch (error) {
      console.error(`Failed to process directory ${dir}:`, error);
      process.exitCode = 1;
      return;
    }
  }
  console.log(`Recolored ${summaries.length} SVG files.`);
})();
