import { useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EditorField,
  EditorSection,
  EditorStatusPill,
  EditorToolbar,
} from "@/features/dev/components";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
  TRANSLATION_CREDIT_CONTRIBUTION_MAX_LENGTH,
  TRANSLATION_CREDIT_LOCALES,
  type TranslationCredits,
} from "@/data/content/translationCredits";
import translationLocaleNames from "@/i18n/translationLocaleNames.json";

const LOCALE_NAMES = translationLocaleNames as Record<string, string>;

type AboutTranslationCreditsSectionProps = {
  availableProfiles: NormalizedUserProfile[];
  credits: TranslationCredits;
  isDirty: boolean;
  onAdd: (locale: string, profileKey: string) => void;
  onRemove: (locale: string, profileKey: string) => void;
  onContributionChange: (locale: string, profileKey: string, contribution: string) => void;
  onReset: () => void;
};

/**
 * Admin-only: who each language's glossary and About mirror credit for its
 * translation. A credit names an existing contributor profile and adds one
 * contribution line; the profile's name and links come from the profile.
 */
export function AboutTranslationCreditsSection({
  availableProfiles,
  credits,
  isDirty,
  onAdd,
  onRemove,
  onContributionChange,
  onReset,
}: AboutTranslationCreditsSectionProps) {
  const [locale, setLocale] = useState<string>(TRANSLATION_CREDIT_LOCALES[0] ?? "zh-Hans");
  const localeCredits = useMemo(() => credits[locale] ?? [], [credits, locale]);
  const profileByKey = useMemo(
    () => new Map(availableProfiles.map((profile) => [profile.key, profile])),
    [availableProfiles],
  );

  const localeOptions = useMemo(
    () =>
      TRANSLATION_CREDIT_LOCALES.map((code) => {
        const count = credits[code]?.length ?? 0;
        return {
          value: code,
          label: LOCALE_NAMES[code] ?? code,
          hint: count ? `${code} · ${count} credited` : code,
        };
      }),
    [credits],
  );
  const candidateOptions = useMemo(() => {
    const credited = new Set(localeCredits.map((credit) => credit.profileKey));
    return availableProfiles
      .filter((profile) => !credited.has(profile.key))
      .map((profile) => ({ value: profile.key, label: profile.displayName, hint: `@${profile.key.toLowerCase()}` }));
  }, [availableProfiles, localeCredits]);

  return (
    <EditorSection
      aria-label="Translation credits"
      icon="lucide:languages"
      title="Translation credits"
      description="People credited on a language's public glossary and its About page. Pick a language, add a contributor profile, and write one line on what they contributed."
      actions={(
        <EditorStatusPill tone={isDirty ? "warning" : "success"}>{isDirty ? "Changed" : "Clean"}</EditorStatusPill>
      )}
    >
      <EditorField label="Language">
        {(control) => (
          <SearchablePicker
            id={control.id}
            options={localeOptions}
            value={locale}
            onChange={(next) => {
              if (next) setLocale(next);
            }}
            placeholder="Find a language"
            emptyText="No translation language matches that."
            ariaLabel="Translation credit language"
          />
        )}
      </EditorField>

      {localeCredits.length > 0 ? (
        <ul aria-label={`${LOCALE_NAMES[locale] ?? locale} credits`} className="space-y-3">
          {localeCredits.map((credit) => {
            const displayName = profileByKey.get(credit.profileKey)?.displayName ?? credit.profileKey;
            const inputId = `translation-credit-${locale}-${credit.profileKey}`;
            return (
              <li
                key={credit.profileKey}
                className="space-y-2 rounded-xl border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] px-3 py-2.5"
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold theme-text-primary">{displayName}</p>
                    <p className="truncate text-xs uppercase tracking-[0.3em] theme-text-faint">@{credit.profileKey.toLowerCase()}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label={`Remove ${displayName}`}
                    onClick={() => onRemove(locale, credit.profileKey)}
                  >
                    <Icon icon="lucide:x" size={16} />
                  </Button>
                </div>
                <label htmlFor={inputId} className="sr-only">{`Contribution for ${displayName}`}</label>
                <Input
                  id={inputId}
                  value={credit.contribution}
                  maxLength={TRANSLATION_CREDIT_CONTRIBUTION_MAX_LENGTH}
                  placeholder="What they contributed, in one line"
                  onChange={(event) => onContributionChange(locale, credit.profileKey, event.target.value)}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="theme-text-faint text-sm">No one is credited for this language yet.</p>
      )}

      <EditorField label="Add contributor" description="Search by name or profile key. Create the profile in the Profile tab first if it does not exist.">
        {(control) => (
          <SearchablePicker
            id={control.id}
            options={candidateOptions}
            value={null}
            onChange={(key) => {
              if (key) onAdd(locale, key);
            }}
            placeholder="Find a contributor to credit"
            emptyText="No contributor matches that."
            ariaLabel="Add translation contributor"
          />
        )}
      </EditorField>

      <EditorToolbar label="Translation credit actions" variant="compact" className="text-xs">
        <Button type="button" variant="secondary" size="sm" onClick={onReset} disabled={!isDirty}>
          <Icon icon="lucide:refresh-cw" className="h-3.5 w-3.5" size={14} />
          Reset credits
        </Button>
      </EditorToolbar>
    </EditorSection>
  );
}
