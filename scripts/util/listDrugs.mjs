import { readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

const articlesPath = resolve(process.cwd(), 'src/data/articles.json');
const outputPath = resolve(process.cwd(), 'notes and plans', 'drug-list.txt');

async function main() {
  const raw = await readFile(articlesPath, 'utf8');
  const articles = JSON.parse(raw);

  if (!Array.isArray(articles)) {
    throw new Error('Expected articles.json to contain an array');
  }

  const names = articles
    .map((article) => article?.drug_info?.drug_name || article?.title || '')
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  const uniqueSorted = [...new Set(names)].sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' })
  );

  await writeFile(outputPath, uniqueSorted.join('\n'), 'utf8');
  console.log(`Wrote ${uniqueSorted.length} drug names to ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
