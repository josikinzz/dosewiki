"use client";

import { useCallback, useEffect, useState } from "react";
import type { ParentCategoryConfig } from "./effectsIndexConfig";

interface ExportEffect {
  name: string;
  lowerTags: Set<string>;
}

export interface ExportParentCategory extends ParentCategoryConfig {
  totalEffects: number;
}

export interface ExportFlatCategory {
  key: string;
  title: string;
  effects: { name: string }[];
}

async function writeToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);

  const selection = document.getSelection?.();
  const previousRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  textarea.select();

  let successful = false;
  try {
    successful = document.execCommand("copy");
  } catch {
    successful = false;
  }

  document.body.removeChild(textarea);
  if (selection) {
    selection.removeAllRanges();
    if (previousRange) {
      selection.addRange(previousRange);
    }
  }
  return successful;
}

export function useEffectCategoryExport(effects: ExportEffect[]) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedKey) return;
    const timeout = window.setTimeout(() => setCopiedKey(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [copiedKey]);

  const getParentCategorySections = useCallback(
    (category: ExportParentCategory) =>
      category.subcategories
        .map((subcategory) => {
          const lowerSubTags = subcategory.tags.map((tag) => tag.toLowerCase());
          const sectionEffects = effects.filter((effect) =>
            lowerSubTags.every((tag) => effect.lowerTags.has(tag)),
          );
          return { title: subcategory.title, effects: sectionEffects };
        })
        .filter((section) => section.effects.length > 0),
    [effects],
  );

  const buildMarkdownForParentCategory = useCallback(
    (category: ExportParentCategory) => {
      const lines: string[] = [`### ${category.title}`];
      const sections = getParentCategorySections(category);
      if (sections.length > 0) {
        sections.forEach((section) => {
          lines.push("");
          if (section.title) lines.push(`#### ${section.title}`);
          section.effects.forEach((effect) => lines.push(`- ${effect.name}`));
        });
      } else {
        lines.push("", "- _No effects_");
      }
      return lines.join("\n");
    },
    [getParentCategorySections],
  );

  const handleCopyParentCategory = useCallback(
    async (category: ExportParentCategory) => {
      try {
        const copied = await writeToClipboard(buildMarkdownForParentCategory(category));
        if (copied) setCopiedKey(category.key);
      } catch {
        console.error("Failed to copy effect category list");
      }
    },
    [buildMarkdownForParentCategory],
  );

  const handleCopyFlatCategory = useCallback(async (category: ExportFlatCategory) => {
    const lines: string[] = [`### ${category.title}`];
    if (category.effects.length > 0) {
      lines.push("");
      category.effects.forEach((effect) => lines.push(`- ${effect.name}`));
    } else {
      lines.push("", "- _No effects_");
    }

    try {
      const copied = await writeToClipboard(lines.join("\n"));
      if (copied) setCopiedKey(category.key);
    } catch {
      console.error("Failed to copy effect category list");
    }
  }, []);

  return { copiedKey, handleCopyFlatCategory, handleCopyParentCategory };
}
