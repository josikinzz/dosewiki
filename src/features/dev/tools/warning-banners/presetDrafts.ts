import {
  WARNING_BANNER_KEY_PATTERN,
  WARNING_BANNER_LIMITS,
  type WarningBannerPreset,
  type WarningBannerTarget,
} from "@/data/substanceWarningBanners";
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

/**
 * What stands between a draft and Publish preset: the same required fields
 * and limits the route enforces, checked on the page so each shows on its
 * field instead of failing after the confirm. The drawer marks the fields;
 * the studio's save dock says why Publish is blocked.
 */
export type PresetDraftIssues = {
  keyValid: boolean;
  headlineError: string | null;
  pointsError: string | null;
  severityError: string | null;
  overSlugBudget: boolean;
  /** A copy field is missing or too long. */
  contentInvalid: boolean;
};

export function presetDraftIssues(draft: WarningBannerPreset): PresetDraftIssues {
  const points = draft.points.map((point) => point.trim()).filter(Boolean);
  const headlineError = draft.headline.length > WARNING_BANNER_LIMITS.headlineMaxLength
    ? `The headline is ${draft.headline.length} characters; the limit is ${WARNING_BANNER_LIMITS.headlineMaxLength}.`
    : !draft.headline.trim() ? "Add a headline before publishing." : null;
  const pointsError = points.length > WARNING_BANNER_LIMITS.maxPoints
    ? `That is ${points.length} lines; the limit is ${WARNING_BANNER_LIMITS.maxPoints}.`
    : points.some((point) => point.length > WARNING_BANNER_LIMITS.pointMaxLength)
      ? `Shorten each line to ${WARNING_BANNER_LIMITS.pointMaxLength} characters or fewer.` : null;
  const severityError = !draft.severityLabel.trim()
    ? "Add a severity label before publishing."
    : draft.severityLabel.length > WARNING_BANNER_LIMITS.severityLabelMaxLength
      ? `Shorten the severity label to ${WARNING_BANNER_LIMITS.severityLabelMaxLength} characters or fewer.` : null;
  return {
    keyValid: WARNING_BANNER_KEY_PATTERN.test(draft.key.trim()),
    headlineError,
    pointsError,
    severityError,
    overSlugBudget: draft.enabledSlugs.length > WARNING_BANNER_LIMITS.maxEnabledSlugs,
    contentInvalid: Boolean(headlineError || pointsError || severityError),
  };
}

/** Why Publish preset is blocked right now, in one sentence, or null when it is not. */
export function publishBlocker(issues: PresetDraftIssues, iconValid: boolean, isNew: boolean): string | null {
  if (isNew && !issues.keyValid) return "Give the preset a key before publishing.";
  if (issues.contentInvalid) return "Fix the highlighted fields before publishing. Your changes are kept.";
  if (!iconValid) return "Publishing waits until the icon resolves. An unknown id renders no glyph, silently.";
  if (issues.overSlugBudget) return `A preset holds at most ${WARNING_BANNER_LIMITS.maxEnabledSlugs} substances. Remove some, or switch on All substance articles.`;
  return null;
}
