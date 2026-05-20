export function extractErowidMarkdownSection(content: string, sectionName: string): string | undefined {
  const pattern = new RegExp(`^## ${sectionName}\\s*\\n([\\s\\S]*)`, "im");
  const match = content.match(pattern);
  if (!match) return undefined;

  let sectionContent = match[1];
  const nextHeaderMatch = sectionContent.match(/^## /m);
  if (nextHeaderMatch && nextHeaderMatch.index !== undefined) {
    sectionContent = sectionContent.slice(0, nextHeaderMatch.index);
  }

  return sectionContent.trim();
}

export function extractErowidSubsection(content: string, sectionName: string): string | undefined {
  const escapedSectionName = sectionName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const headerPattern = new RegExp(`${escapedSectionName}\\s*#`, "i");
  const headerMatch = content.match(headerPattern);
  if (!headerMatch || headerMatch.index === undefined) return undefined;

  const startIndex = headerMatch.index + headerMatch[0].length;
  let sectionContent = content.slice(startIndex);
  const nextMarkerMatch = sectionContent.match(/\n[A-Z][A-Z ]+#/);
  if (nextMarkerMatch && nextMarkerMatch.index !== undefined) {
    sectionContent = sectionContent.slice(0, nextMarkerMatch.index);
  }

  return sectionContent.trim();
}

export function extractErowidNestedSubsection(content: string, sectionName: string): string | undefined {
  const escapedSectionName = sectionName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
  const headerPattern = new RegExp(`${escapedSectionName}\\s*#`, "i");
  const headerMatch = content.match(headerPattern);
  if (!headerMatch || headerMatch.index === undefined) return undefined;

  const startIndex = headerMatch.index + headerMatch[0].length;
  let sectionContent = content.slice(startIndex);
  const nextMarkerMatch = sectionContent.match(/\n[A-Z][A-Za-z/.&\- ]+#/);
  if (nextMarkerMatch && nextMarkerMatch.index !== undefined) {
    sectionContent = sectionContent.slice(0, nextMarkerMatch.index);
  }

  return sectionContent.trim();
}
