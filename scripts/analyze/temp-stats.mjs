import { readFileSync } from 'fs';

const data = JSON.parse(readFileSync('./src/data/parsed-sources.json', 'utf-8'));
const substances = data.substances;

const dosageBySource = {};
const durationBySource = {};

for (const sub of Object.values(substances)) {
  if (sub.dosage) {
    for (const d of sub.dosage) {
      dosageBySource[d.source] = (dosageBySource[d.source] || 0) + 1;
    }
  }
  if (sub.duration) {
    for (const d of sub.duration) {
      durationBySource[d.source] = (durationBySource[d.source] || 0) + 1;
    }
  }
}

console.log("=== DOSAGE BY SOURCE ===");
Object.entries(dosageBySource).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(k + ": " + v));

console.log("");
console.log("=== DURATION BY SOURCE ===");
Object.entries(durationBySource).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(k + ": " + v));

let noDosage = 0;
let noDuration = 0;
for (const sub of Object.values(substances)) {
  if (!sub.dosage || sub.dosage.length === 0) noDosage++;
  if (!sub.duration || sub.duration.length === 0) noDuration++;
}
console.log("");
console.log("Total substances: " + Object.keys(substances).length);
console.log("No dosage data: " + noDosage);
console.log("No duration data: " + noDuration);
