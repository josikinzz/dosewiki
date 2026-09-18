import { readFileSync } from "fs";

const articles = JSON.parse(readFileSync("public/SubstanceIndex.json", "utf-8"));

// Check specific articles if passed as args, otherwise first 26
const args = process.argv.slice(2);
let toCheck;

if (args.length > 0) {
  toCheck = args.map(title => articles.find(a => a.title === title)).filter(Boolean);
} else {
  toCheck = articles
    .filter(a => a.priority === "high" || a.priority === "normal")
    .slice(0, 26);
}

for (const a of toCheck) {
  const countries = Object.keys(a.legality?.countries || {});
  const intl = a.legality?.international?.length || 0;
  const emptyNotes = Object.entries(a.legality?.countries || {})
    .filter(([, v]) => !v.notes || v.notes.trim() === "")
    .map(([k]) => k);

  console.log(`\n=== ${a.title} ===`);
  console.log(`International: ${intl}, Countries: ${countries.length}`);
  if (emptyNotes.length > 0) {
    console.log(`⚠️ EMPTY NOTES: ${emptyNotes.join(", ")}`);
  } else {
    console.log(`✅ All notes filled`);
  }
  console.log(`Countries: ${countries.join(", ")}`);
}
