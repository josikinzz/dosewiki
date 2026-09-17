import { readFileSync } from "fs";

const articles = JSON.parse(readFileSync("public/SubstanceIndex.json", "utf-8"));

const priorityArticles = articles.filter(a => a.priority === "high" || a.priority === "normal");

let totalCountries = 0;
let emptyNotesCount = 0;
let zeroCountriesCount = 0;
const issues = [];

for (const a of priorityArticles) {
  const countries = Object.keys(a.legality?.countries || {});
  totalCountries += countries.length;

  if (countries.length === 0) {
    zeroCountriesCount++;
  }

  const emptyNotes = Object.entries(a.legality?.countries || {})
    .filter(([, v]) => !v.notes || v.notes.trim() === "")
    .map(([k]) => k);

  if (emptyNotes.length > 0) {
    emptyNotesCount += emptyNotes.length;
    issues.push({ title: a.title, emptyNotes });
  }
}

console.log("=== Legality Review Summary ===");
console.log(`Total articles: ${priorityArticles.length}`);
console.log(`Total country entries: ${totalCountries}`);
console.log(`Articles with 0 countries: ${zeroCountriesCount}`);
console.log(`Empty notes found: ${emptyNotesCount}`);

if (issues.length > 0) {
  console.log("\n=== Articles with empty notes ===");
  for (const issue of issues) {
    console.log(`${issue.title}: ${issue.emptyNotes.join(", ")}`);
  }
}
