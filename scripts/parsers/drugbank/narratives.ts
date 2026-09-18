import { cleanMarkdown, extractSection, stripReferences } from "../base";

export function parseOverviewNarrative(content: string): Array<{ section: string; content: string }> {
  const notes: Array<{ section: string; content: string }> = [];
  const sectionMap: Array<{ heading: string; section: string; level?: number }> = [
    { heading: "Description", section: "description", level: 3 },
    { heading: "Background", section: "background", level: 3 },
    { heading: "Indication", section: "indication", level: 3 },
    { heading: "Toxicity", section: "toxicity", level: 3 },
    { heading: "Short-term Risks", section: "short_term_risks", level: 3 },
    { heading: "Long-term Risks", section: "long_term_risks", level: 3 },
    { heading: "Effects on human performance", section: "effects_on_performance", level: 3 },
    { heading: "Non-medical use", section: "non_medical_use", level: 3 },
    { heading: "Safer Use", section: "safer_use", level: 2 },
    { heading: "Addiction", section: "addiction", level: 3 },
    { heading: "Pharmacodynamics", section: "pharmacodynamics", level: 3 },
  ];

  for (const entry of sectionMap) {
    const section = extractSection(content, entry.heading, entry.level ?? 3);
    if (!section) continue;
    const cleaned = stripReferences(cleanMarkdown(section));
    if (cleaned.length > (entry.section === "pharmacodynamics" ? 50 : 20)) {
      notes.push({ section: entry.section, content: cleaned });
    }
  }

  const dependenceSection =
    extractSection(content, "Dependence and withdrawal", 3) || extractSection(content, "Dependence", 3);
  if (dependenceSection) {
    const cleaned = stripReferences(cleanMarkdown(dependenceSection));
    if (cleaned.length > 20) {
      notes.push({ section: "dependence", content: cleaned });
    }
  }

  return notes;
}
