import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

import { CONFIG } from "./cli.mjs";
import { CATEGORIES } from "./categories.mjs";

export function buildUserMessage(substanceName, sources, contents, category) {
  const config = CATEGORIES[category];
  const excludedSources = config.excludedSources || [];

  let message = `# Substance: ${substanceName}\n\n`;
  message += `Please extract ${category.replace("-", " ")} content from the following sources.\n\n`;

  for (const source of sources) {
    const sourceContent = contents[source.id];
    const isExcluded = excludedSources.includes(source.id);
    message += `---\n\n`;
    message += `## Source: ${source.displayName}\n`;
    message += `Source ID: ${source.id}\n\n`;

    if (isExcluded) {
      message += `*This source is EXCLUDED from ${category} extraction - skip it.*\n\n`;
    } else if (sourceContent) {
      message += `\`\`\`markdown\n${sourceContent}\n\`\`\`\n\n`;
    } else {
      message += `*No content available for this source.*\n\n`;
    }
  }

  return message;
}

export function formatOutputFile(substanceName, category, extractedContent, generatedDate = new Date().toISOString().split("T")[0]) {
  const config = CATEGORIES[category];
  return `# ${substanceName} - ${config.title}

> Verbatim extractions from source articles. Generated ${generatedDate}.

${extractedContent}
`;
}

function getOutputPath(slug, category) { const config = CATEGORIES[category];
return join(CONFIG.projectRoot, config.outputDir, `${slug}${config.outputSuffix}`); }



export function saveOutput(slug, category, content) {
  const config = CATEGORIES[category];
  const outputDir = join(CONFIG.projectRoot, config.outputDir);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  const outputPath = getOutputPath(slug, category);
  writeFileSync(outputPath, content, "utf-8");
  return outputPath;
}
