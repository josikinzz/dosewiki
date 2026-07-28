#!/usr/bin/env node

/**
 * Read-only network probe for Effect Index media that could not be reconciled.
 *
 * `--plan` deliberately performs no network requests or output writes. The normal
 * mode writes only its resumable local report; it never downloads media.
 */
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const effectIndexRoot = process.env.EFFECTINDEX_ROOT
  ?? '/Users/josie/Documents/Utilities/EffectIndex-master';
const reportPath = path.join(repoRoot, 'notes-and-plans/reports/media-recovery-probe-results.json');
const summaryPath = path.join(repoRoot, 'notes-and-plans/reports/media-recovery-2026-07-27.md');
const reconciliationPath = path.join(
  repoRoot,
  'notes-and-plans/reports/replications-reconciliation-2026-07-27.json',
);
const r2Base = 'https://pub-879bfd45a9774f1c80a8b77aca1f0aee.r2.dev';
const effectIndexBase = 'https://effectindex.com';
const delayMs = 250;

function usage() {
  console.log(`Usage: node scripts/replications/probe-effectindex-media-recovery.mjs [--plan] [--limit N]

  --plan       Print the complete probe matrix without network requests or writes.
  --limit N    Probe at most N unprobed assets (normal mode only).

Set EFFECTINDEX_ROOT when the EI checkout is not at its usual sibling path.`);
}

function parseArgs(argv) {
  const options = { plan: false, limit: Infinity };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--plan') options.plan = true;
    else if (argument === '--limit') {
      const value = Number(argv[index + 1]);
      if (!Number.isInteger(value) || value < 1) throw new Error('--limit must be a positive integer.');
      options.limit = value;
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      usage();
      process.exit(0);
    } else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

function encodedUrl(base, filename) {
  return `${base}/${filename.split('/').map(encodeURIComponent).join('/')}`;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function titleSlug(title) {
  return title
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseVideoMappings(markdown) {
  const mappings = new Map();
  for (const line of markdown.split('\n')) {
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    if (!match || !/\.(?:mp4|webm)$/i.test(match[2].trim())) continue;
    const [, title, filename, id] = match.map((value) => value.trim());
    const current = mappings.get(id) ?? { filenames: [], titles: [] };
    current.filenames.push(filename);
    current.titles.push(title);
    mappings.set(id, current);
  }
  return mappings;
}

function parseStreamableMappings(markdown) {
  const mappings = new Map();
  const blocks = markdown.split(/^##\s+\d+\.\s+/m).slice(1);
  for (const block of blocks) {
    const title = block.split('\n')[0]?.trim();
    const url = block.match(/\*\*Streamable URL:\*\* \[(https:\/\/streamable\.com\/e\/[^\])]+)/)?.[1];
    if (title && url) mappings.set(title.toLowerCase(), url);
  }
  return mappings;
}

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(resolved));
    else if (entry.isFile()) files.push(resolved);
  }
  return files;
}

async function locallyAvailableProfileFiles() {
  const roots = [path.join(effectIndexRoot, 'static'), path.join(effectIndexRoot, '.output/public')];
  const files = (await Promise.all(roots.map(async (root) => {
    try { return await walkFiles(root); } catch { return []; }
  }))).flat();
  const byBaseName = new Map();
  for (const file of files) {
    const name = path.basename(file).toLowerCase();
    const values = byBaseName.get(name) ?? [];
    values.push(file);
    byBaseName.set(name, values);
  }
  return byBaseName;
}

function availabilityCandidate(url) {
  return {
    kind: 'wayback-availability',
    url: `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`,
    sourceUrl: url,
  };
}

function cdxCandidate(url) {
  return {
    kind: 'wayback-cdx',
    url: `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(url)}&output=json&filter=statuscode:200&limit=5`,
    sourceUrl: url,
  };
}

function directCandidate(url, kind = 'direct') {
  return { kind, url };
}

function videoCandidates(asset, videoMappings, streamableMappings) {
  const mapping = videoMappings.get(asset.media) ?? { filenames: [], titles: [] };
  const ids = unique([asset.media, ...[...videoMappings.keys()].filter((id) => id.toLowerCase() === asset.media.toLowerCase())]);
  const names = unique([
    ...mapping.filenames,
    ...mapping.titles.flatMap((title) => [`${titleSlug(title)}.mp4`, `${titleSlug(title)}.webm`]),
    `${titleSlug(asset.title)}.mp4`,
    `${titleSlug(asset.title)}.webm`,
    ...ids.map((id) => `${id}.mp4`),
  ]);
  const candidates = names.map((name) => directCandidate(encodedUrl(r2Base, name), 'r2'));
  for (const id of ids) {
    for (const extension of ['mp4', 'webm']) {
      const mediaUrl = `https://giant.gfycat.com/${id}.${extension}`;
      candidates.push(availabilityCandidate(mediaUrl), cdxCandidate(mediaUrl));
    }
    candidates.push(cdxCandidate(`https://giant.gfycat.com/${id}*`));
    candidates.push(cdxCandidate(`https://thumbs.gfycat.com/${id}*`));
  }
  const streamable = streamableMappings.get(asset.title.trim().toLowerCase());
  if (streamable) candidates.push(directCandidate(streamable, 'streamable'));
  candidates.push(directCandidate(`https://web.archive.org/web/2023/https://gfycat.com/${encodeURIComponent(asset.media)}`, 'wayback-page'));
  return candidates;
}

function effectIndexCandidates(asset, pathname) {
  const source = `${effectIndexBase}${pathname}`;
  return [directCandidate(source, 'effectindex'), availabilityCandidate(source), cdxCandidate(source)];
}

function profileArtist(record) {
  return record.username ?? record.alias ?? record.full_name ?? 'Unknown';
}

async function buildAssets() {
  const [reconciliation, videoMarkdown, streamableMarkdown, profiles, people, localFiles] = await Promise.all([
    readFile(reconciliationPath, 'utf8').then(JSON.parse),
    readFile(path.join(effectIndexRoot, 'video_effects_mapping.md'), 'utf8'),
    readFile(path.join(effectIndexRoot, 'streamable_links.md'), 'utf8'),
    readFile(path.join(effectIndexRoot, 'effectindex_dump/profiles.json'), 'utf8').then(JSON.parse),
    readFile(path.join(effectIndexRoot, 'effectindex_dump/people.json'), 'utf8').then(JSON.parse),
    locallyAvailableProfileFiles(),
  ]);
  const videoMappings = parseVideoMappings(videoMarkdown);
  const streamableMappings = parseStreamableMappings(streamableMarkdown);
  const videos = reconciliation.records
    .filter((record) => record.classification === 'missing' && record.type === 'video')
    .map((record) => ({
      id: `video:${record.ei_id}`,
      assetKind: 'video', title: record.title, media: record.media,
      artist: record.artist, artist_url: record.artist_url,
      candidates: videoCandidates(record, videoMappings, streamableMappings),
    }));
  const plushies = reconciliation.records.find((record) => record.title === 'Blurry Plushies');
  if (!plushies) throw new Error('Could not find Blurry Plushies in the reconciliation report.');
  const images = [{
    id: `image:${plushies.ei_id}`, assetKind: 'image', title: plushies.title, media: 'plushies.jpg',
    artist: plushies.artist, artist_url: plushies.artist_url,
    candidates: effectIndexCandidates(plushies, '/img/gallery/plushies.jpg'),
  }];
  const audioNames = new Set([
    'deliriant audio.mp3', 'Psilocybin Auditory Replication.mp3', '[VOLUME WARNING] - Tinnitus Replication.mp3',
  ]);
  const audio = reconciliation.records
    .filter((record) => record.classification === 'missing' && audioNames.has(record.media))
    .map((record) => ({
      id: `audio:${record.ei_id}`, assetKind: 'audio', title: record.title, media: record.media,
      artist: record.artist, artist_url: record.artist_url,
      manual_lead: record.media === 'Psilocybin Auditory Replication.mp3' ? record.artist_url : null,
      candidates: effectIndexCandidates(record, `/audio/${encodeURIComponent(record.media)}`),
    }));
  const profileReferences = [...profiles, ...people].flatMap((record) =>
    ['profileImageCropped', 'profileImageFull', 'profile_image'].flatMap((field) => record[field]
      ? [{ filename: record[field], field, record }] : []));
  const seenProfiles = new Set();
  const profilesToProbe = profileReferences.flatMap(({ filename, field, record }) => {
    const normalized = filename.replace(/^img\//, '');
    if (seenProfiles.has(normalized)) return [];
    seenProfiles.add(normalized);
    const localPath = localFiles.get(path.basename(normalized).toLowerCase())?.[0];
    const artist = profileArtist(record);
    const artistUrl = record.profile_url ? `${effectIndexBase}/people/${record.profile_url}` : `${effectIndexBase}/profiles/${artist}`;
    const profilePath = field === 'profileImageCropped'
      ? `/img/profiles/cropped/${filename}`
      : field === 'profileImageFull'
        ? `/img/profiles/${filename}`
        : `/img/${normalized}`;
    return [{
      id: `profile:${normalized}`, assetKind: 'profile', title: artist, media: filename,
      profile_field: field, artist, artist_url: artistUrl,
      local_path: localPath ?? null,
      candidates: localPath ? [] : effectIndexCandidates(record, profilePath),
    }];
  });
  return [...videos, ...images, ...audio, ...profilesToProbe];
}

async function requestCandidate(candidate) {
  try {
    const response = await fetch(candidate.url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(20_000) });
    const result = { candidate, status: response.status, final_url: response.url };
    if (!response.ok) return { ...result, hit: false };
    if (candidate.kind === 'wayback-availability') {
      const snapshot = (await response.json()).archived_snapshots?.closest;
      return { ...result, hit: Boolean(snapshot?.available), located_url: snapshot?.url ?? null };
    }
    if (candidate.kind === 'wayback-cdx') {
      const rows = await response.json();
      const first = Array.isArray(rows) && rows.length > 1 ? rows[1] : null;
      const timestamp = first?.[1];
      const original = first?.[2] ?? candidate.sourceUrl;
      return { ...result, hit: Boolean(timestamp), located_url: timestamp ? `https://web.archive.org/web/${timestamp}/${original}` : null };
    }
    return { ...result, hit: response.status >= 200 && response.status < 400, located_url: response.url };
  } catch (error) {
    return { candidate, hit: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function readResults() {
  try { return JSON.parse(await readFile(reportPath, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return { assets: {} }; throw error; }
}

async function writeJsonAtomically(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

function resultStatus(result) {
  if (result.local_path || result.located_url) return 'recovered';
  if (result.manual_lead) return 'lead-found';
  return 'unrecoverable';
}

function markdownLink(url) { return url ? `<${url}>` : 'not provided'; }

async function writeSummary(results) {
  const groups = { recovered: [], 'lead-found': [], unrecoverable: [] };
  for (const result of Object.values(results.assets)) groups[resultStatus(result)].push(result);
  const lines = ['# Effect Index media recovery probe', '', `Generated: ${new Date().toISOString()}`, ''];
  for (const [status, heading] of Object.entries({ recovered: 'Recovered', 'lead-found': 'Lead found', unrecoverable: 'Unrecoverable' })) {
    lines.push(`## ${heading}`, '');
    if (!groups[status].length) lines.push('_None._', '');
    for (const result of groups[status]) {
      const located = result.local_path ?? result.located_url ?? result.manual_lead ?? 'No located URL';
      lines.push(`- **${result.assetKind}: ${result.title}** — ${result.media}; artist: ${result.artist}; artist URL: ${markdownLink(result.artist_url)}; result: ${markdownLink(located)}`);
    }
    lines.push('');
  }
  await writeFile(summaryPath, `${lines.join('\n')}\n`);
}

function printPlan(assets) {
  const counts = new Map();
  for (const asset of assets) {
    const count = counts.get(asset.assetKind) ?? { assets: 0, probeRows: 0, local: 0 };
    count.assets += 1;
    count.probeRows += asset.candidates.length;
    if (asset.local_path) count.local += 1;
    counts.set(asset.assetKind, count);
  }
  console.log('Effect Index media-recovery probe matrix (no network):');
  for (const [kind, count] of counts) console.log(`${kind}: ${count.assets} assets, ${count.probeRows} probe rows, ${count.local} recovered locally`);
  for (const asset of assets) {
    console.log(`\n[${asset.assetKind}] ${asset.title} | ${asset.media} | artist=${asset.artist} | artist_url=${asset.artist_url || '(none)'}`);
    if (asset.local_path) console.log(`  local: ${asset.local_path}`);
    if (asset.manual_lead) console.log(`  manual lead (do not rip): ${asset.manual_lead}`);
    asset.candidates.forEach((candidate, index) => console.log(`  ${index + 1}. ${candidate.kind}: ${candidate.url}`));
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const assets = await buildAssets();
  if (options.plan) { printPlan(assets); return; }
  const results = await readResults();
  let probed = 0;
  for (const asset of assets) {
    if (results.assets[asset.id] || probed >= options.limit) continue;
    const record = { ...asset, probed_at: new Date().toISOString(), attempts: [] };
    if (asset.local_path) record.located_url = asset.local_path;
    else {
      for (const candidate of asset.candidates) {
        const attempt = await requestCandidate(candidate);
        record.attempts.push(attempt);
        if (attempt.hit) { record.located_url = attempt.located_url; break; }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    results.assets[asset.id] = record;
    results.updated_at = new Date().toISOString();
    await writeJsonAtomically(reportPath, results);
    probed += 1;
  }
  await writeSummary(results);
  console.log(`Probed ${probed} asset(s). Results: ${path.relative(repoRoot, reportPath)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
