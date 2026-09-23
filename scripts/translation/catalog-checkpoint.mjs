import { appendFile, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isBlocking } from './validate.mjs';

// Bump when the catalog's prompt construction recipe changes.
export function catalogCheckpointIdentity(inputs) {
  return createHash('sha256').update(JSON.stringify({ recipe: 'ui-catalog-v1', ...inputs })).digest('hex');
}

/** Local model evidence only. A checkpoint never grants human approval. */
export async function openCatalogCheckpoint(file, identity) {
  await mkdir(path.dirname(file), { recursive: true });
  try { await writeFile(file, `${JSON.stringify({ type: 'catalog-input', identity })}\n`, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const lines = (await readFile(file, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  if (lines[0]?.type !== 'catalog-input' || lines[0]?.identity !== identity) throw new Error('Catalog checkpoint input identity changed. Use a new checkpoint.');
  const targets = new Map();
  for (const entry of lines.slice(1)) {
    if (typeof entry.key !== 'string' || typeof entry.source !== 'string' || typeof entry.target !== 'string' || !Array.isArray(entry.defects)) throw new Error('Invalid catalog checkpoint entry.');
    if (!isBlocking(entry.defects) && entry.target.trim()) targets.set(entry.key, entry);
    else targets.delete(entry.key);
  }
  return { targets, append: async entry => appendFile(file, `${JSON.stringify(entry)}\n`) };
}
