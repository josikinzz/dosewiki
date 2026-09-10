const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export type AboutCopyNotice = {
  target: "markdown" | "subtitle";
  ok: boolean;
};

/**
 * The Copy Studio blocks that render on the public About page. Listed here
 * rather than filtered from `COPY_BLOCK_DEFAULTS` so the About editor does not
 * carry the whole copy-block catalogue in its chunk; the About editor test
 * checks this list against the catalogue's "About" group.
 */
export const ABOUT_COPY_BLOCKS: readonly { key: string; label: string }[] = [
  { key: "about-reuse-notice", label: "Reuse notice" },
  { key: "about-reuse-notice-effect-index", label: "Reuse notice (Effect Index)" },
  { key: "about-doc-link-blurbs", label: "Documentation card blurbs" },
  { key: "about-mission-effect-index", label: "Mission statement (Effect Index)" },
  { key: "about-community-intro", label: "Community intro" },
];

/**
 * Drops the leading `# Heading` line that `buildTextChangelog` prepends;
 * the editor renders its own labels above each diff well.
 */
export function stripDiffHeading(diffText: string): string {
  return diffText.replace(/^# [^\n]*\n+/, "");
}

export function resolveAboutPlaceholders(
  value: string,
  placeholderValues: Record<string, string>,
): string {
  if (!value) {
    return "";
  }

  return value.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
    const normalizedKey = key.trim();
    return placeholderValues[normalizedKey] ?? match;
  });
}

/**
 * Grows a textarea to fit its content between `minHeight` and `maxHeight`.
 * Beyond the cap the field keeps its own scrollbar instead of stretching the
 * page, so a long About body stays a field rather than a page-long column.
 */
export function resizeTextareaToContent(
  element: HTMLTextAreaElement | null,
  minHeight: number,
  maxHeight: number,
): void {
  if (!element) {
    return;
  }

  element.style.height = "auto";
  const nextHeight = Math.min(Math.max(element.scrollHeight, minHeight), maxHeight);
  element.style.height = `${nextHeight}px`;
}

/** The auto-grow ceiling: 60% of the viewport, so the cap follows the device. */
export function textareaViewportCap(): number {
  return Math.round(window.innerHeight * 0.6);
}
