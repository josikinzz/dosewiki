const PLACEHOLDER_PATTERN = /{{\s*([a-zA-Z0-9_]+)\s*}}/g;

export type AboutCopyNotice = {
  target: "markdown" | "subtitle";
  ok: boolean;
};

export const ABOUT_COPY_BLOCKS: readonly { key: string; label: string }[] = [
  { key: "about-reuse-notice", label: "Reuse notice" },
  { key: "about-reuse-notice-effect-index", label: "Reuse notice (Effect Index)" },
  { key: "about-doc-link-blurbs", label: "Documentation card blurbs" },
  { key: "about-mission-effect-index", label: "Mission statement (Effect Index)" },
  { key: "about-community-intro", label: "Community intro" },
  { key: "about-collaboration-summaries", label: "Official collaboration one-liners" },
  { key: "about-collaboration-tripsit", label: "Official collaboration: TripSit" },
  { key: "about-collaboration-protestkit", label: "Official collaboration: PRO Test Kit" },
  { key: "about-collaboration-piru", label: "Official collaboration: Piru" },
];

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

export function textareaViewportCap(): number {
  return Math.round(window.innerHeight * 0.6);
}
