import type { WarningBannerPreset, WarningBannerTarget } from "@/data/substanceWarningBanners";
import type { EditableWarningPreset } from "./warningEditing";

/**
 * A preset has two drafts that must never travel together by accident. The
 * copy is what a reader reads; the scope is where it renders. Scope writes made
 * from the drawer (a slug chip, an Enable button) publish the saved copy with
 * the new list, so a half-written headline never goes live because an editor
 * added a substance. Publish preset sends both drafts at once.
 */
export type BannerCopy = Pick<
  WarningBannerPreset,
  "key" | "tone" | "icon" | "severityLabel" | "headline" | "points"
>;
export type BannerScope = {
  enabled: boolean;
  allSubstances: boolean;
  enabledSlugs: string[];
};

/**
 * `origin === null` marks a preset that does not exist yet, which is what makes
 * the key field editable and Save an insert rather than an update.
 */
export type PresetEditor = {
  origin: EditableWarningPreset | null;
  copyDraft: BannerCopy;
  scopeDraft: BannerScope;
};

export function copyOf(preset: WarningBannerPreset): BannerCopy {
  return {
    key: preset.key,
    tone: preset.tone,
    icon: preset.icon,
    severityLabel: preset.severityLabel,
    headline: preset.headline,
    points: preset.points,
  };
}

export function scopeOf(preset: WarningBannerPreset): BannerScope {
  return {
    enabled: preset.enabled,
    allSubstances: preset.allSubstances === true,
    enabledSlugs: preset.enabledSlugs,
  };
}

export function editorFor(origin: EditableWarningPreset | null, blank: WarningBannerPreset): PresetEditor {
  const source = origin ?? blank;
  return { origin, copyDraft: copyOf(source), scopeDraft: scopeOf(source) };
}

/** The whole draft as the drawer shows it and Publish preset submits it. */
export function composeDraft(editor: PresetEditor): EditableWarningPreset {
  return {
    ...editor.copyDraft,
    ...editor.scopeDraft,
    ...(editor.origin?.baseHash ? { baseHash: editor.origin.baseHash } : {}),
  };
}

/** Route one drawer edit into the draft it belongs to. */
export function applyDraftChange(editor: PresetEditor, next: WarningBannerPreset): PresetEditor {
  return { ...editor, copyDraft: copyOf(next), scopeDraft: scopeOf(next) };
}

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export function isCopyDirty(editor: PresetEditor): boolean {
  return editor.origin === null || !same(copyOf(editor.origin), editor.copyDraft);
}

export function isScopeDirty(editor: PresetEditor): boolean {
  return editor.origin === null || !same(scopeOf(editor.origin), editor.scopeDraft);
}

export type CopyChange = { label: string; before: string; after: string };

const COPY_FIELDS: Array<{ label: string; read: (copy: BannerCopy) => string }> = [
  { label: "Headline", read: (copy) => copy.headline.trim() },
  {
    label: "Points",
    read: (copy) => copy.points.map((point) => point.trim()).filter(Boolean).join("\n"),
  },
  { label: "Severity label", read: (copy) => copy.severityLabel.trim() },
  { label: "Tone", read: (copy) => copy.tone },
  { label: "Icon", read: (copy) => copy.icon.trim() },
];

/** Every copy field whose published text changes, before and after. */
export function describeCopyChanges(
  origin: WarningBannerPreset | null,
  draft: BannerCopy,
): CopyChange[] {
  return COPY_FIELDS.flatMap(({ label, read }) => {
    const before = origin ? read(copyOf(origin)) : "";
    const after = read(draft);
    return before === after ? [] : [{ label, before, after }];
  });
}

/** Substance titles for a slug list, falling back to the slug when unknown. */
export function substanceTitles(
  slugs: readonly string[],
  targets: readonly WarningBannerTarget[],
): string[] {
  return slugs.map((slug) => targets.find((target) => target.slug === slug)?.title || slug);
}
