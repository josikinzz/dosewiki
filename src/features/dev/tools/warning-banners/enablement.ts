import type { WarningBannerPreset, WarningBannerTarget } from "@/data/substanceWarningBanners";
import type { ConfirmRequest } from "@/features/dev/components";

export type EnablementChange = {
  action: "enable" | "disable";
  slugs: string[];
};

export type EnablementPlan = {
  nextSlugs: string[];
  summary: string;
  request: Omit<ConfirmRequest, "onConfirm">;
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function planEnablementChange(
  preset: WarningBannerPreset,
  change: EnablementChange,
  targets: readonly WarningBannerTarget[],
  { dirty }: { dirty: boolean },
): EnablementPlan {
  const titleOf = (slug: string) =>
    targets.find((target) => target.slug === slug)?.title || slug;
  const count = change.slugs.length;
  const first = change.slugs[0];
  const firstTitle = titleOf(first);
  const affected = change.slugs.map((slug) => {
    const title = titleOf(slug);
    return title === slug ? slug : `${title} (${slug})`;
  });
  const readerFacing = preset.enabled && !preset.allSubstances;
  const noVisibleChange = preset.enabled
    ? "Readers see no change: this preset reaches every article whatever its list says. The list is still stored in production."
    : "Readers see no change: this preset is switched off. The list is still stored in production and applies when you switch it on.";
  const draftNote = dirty
    ? " Your unsaved edits to its words are not published by this change; they stay a draft."
    : "";

  if (change.action === "disable") {
    const nextSlugs = preset.enabledSlugs.filter((slug) => !change.slugs.includes(slug));
    const target = count === 1 ? firstTitle : plural(count, "substance");
    const remaining = readerFacing
      ? nextSlugs.length === 0
        ? " It will render nowhere afterwards."
        : ` It stays on ${plural(nextSlugs.length, "other substance")}.`
      : "";
    return {
      nextSlugs,
      summary:
        count === 1
          ? `Disabled ${preset.key} on ${firstTitle}.`
          : `Disabled ${preset.key} on ${plural(count, "substance")}.`,
      request: {
        title: `Disable ${preset.key} on ${target}?`,
        description: readerFacing
          ? `Readers of ${count === 1 ? firstTitle : "these articles"} stop seeing this banner as soon as you confirm.${remaining}${draftNote}`
          : `${noVisibleChange}${draftNote}`,
        confirmLabel: count === 1 ? `Disable on ${firstTitle}` : `Disable on ${plural(count, "substance")}`,
        destructive: true,
        affected: count > 1 ? affected : undefined,
        affectedLabel: count > 1 ? `Stops showing on ${plural(count, "substance")}` : undefined,
      },
    };
  }

  const target = count === 1 ? firstTitle : plural(count, "substance");
  return {
    nextSlugs: [...preset.enabledSlugs, ...change.slugs],
    summary: `Enabled ${preset.key} on ${plural(count, "substance")}.`,
    request: {
      title: `Enable ${preset.key} on ${target}?`,
      description: readerFacing
        ? `Readers of ${count === 1 ? firstTitle : "these articles"} see this banner at the top of the page as soon as you confirm.${draftNote}`
        : `${noVisibleChange}${draftNote}`,
      confirmLabel: count === 1 ? `Enable on ${firstTitle}` : `Enable on ${plural(count, "substance")}`,
      affected: count > 1 ? affected : undefined,
      affectedLabel: count > 1 ? `Starts showing on ${plural(count, "substance")}` : undefined,
    },
  };
}
