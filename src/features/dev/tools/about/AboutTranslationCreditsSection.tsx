import { useMemo, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ContributorAvatar } from "@/components/layout/PublicPagePrimitives";
import { TOUCH_ICON } from "@/components/ui/touchTargets";
import { EditorField } from "@/features/dev/components";
import { cn } from "@/lib/utils";
import { SearchablePicker } from "@/features/dev/components/SearchablePicker";
import type { NormalizedUserProfile } from "@/data/userProfiles";
import {
  TRANSLATION_CREDIT_CONTRIBUTION_MAX_LENGTH,
  TRANSLATION_CREDIT_LOCALES,
  type TranslationCredits,
} from "@/data/content/translationCredits";
import translationLocaleNames from "@/i18n/translationLocaleNames.json";

import { AboutPaneSection, ChangedMark } from "./AboutPaneSection";

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

export function AboutTranslationCreditsSection({
  availableProfiles,
  credits,
  isDirty,
  onAdd,
  onRemove,
  onContributionChange,
  onReset,
}: AboutTranslationCreditsSectionProps) {
  const [locale, setLocale] = useState<string>(
    () => TRANSLATION_CREDIT_LOCALES.find((code) => (credits[code]?.length ?? 0) > 0) ?? TRANSLATION_CREDIT_LOCALES[0] ?? "zh-Hans",
  );
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
          hint: count ? `${code}, ${count} credited` : code,
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

  const creditedLanguages = TRANSLATION_CREDIT_LOCALES.filter((code) => (credits[code]?.length ?? 0) > 0);
  return (
    <AboutPaneSection
      title="Translation credits"
      note="People credited on a language's public glossary and its About page. Pick a language, add a contributor profile, and write one line on what they contributed. Only admins see this part."
      aside={
        <>
          <ChangedMark changed={isDirty} />
          {isDirty ? (
            <Button type="button" variant="ghost" size="sm" onClick={onReset}>
              <Icon icon="lucide:rotate-ccw" size={14} />
              Reset credits
            </Button>
          ) : null}
        </>
      }
    >
      <p className="theme-text-faint text-xs">
        {creditedLanguages.length > 0
          ? `Credits in ${creditedLanguages.map((code) => LOCALE_NAMES[code] ?? code).join(", ")}.`
          : "No language credits anyone yet."}
      </p>
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
                className="space-y-2 rounded-card border border-[color:var(--editor-panel-border)] bg-[var(--editor-panel-bg-subtle)] py-2 pl-2.5 pr-1"
              >
                <div className="flex items-center gap-3">
                  <ContributorAvatar imageUrl={profileByKey.get(credit.profileKey)?.avatarUrl ?? undefined} name={displayName} size="xs" />
                  <div className="min-w-0 flex-1">
                    <p className="theme-text-primary truncate text-sm font-medium">{displayName}</p>
                    <p className="theme-text-faint truncate font-mono text-xs">@{credit.profileKey.toLowerCase()}</p>
                  </div>
                  <Button
                    type="button"
                    variant="iconGhost"
                    size="icon"
                    title={`Remove ${displayName}`}
                    className={cn("shrink-0", TOUCH_ICON)}
                    aria-label={`Remove ${displayName}`}
                    onClick={() => onRemove(locale, credit.profileKey)}
                  >
                    <Icon icon="lucide:x" size={16} />
                  </Button>
                </div>
                <label htmlFor={inputId} className="sr-only">{`Contribution for ${displayName}`}</label>
                <div className="pr-1.5">
                <Input
                  id={inputId}
                  value={credit.contribution}
                  maxLength={TRANSLATION_CREDIT_CONTRIBUTION_MAX_LENGTH}
                  placeholder="What they contributed, in one line"
                  onChange={(event) => onContributionChange(locale, credit.profileKey, event.target.value)}
                />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="theme-text-faint text-sm">No one is credited for this language yet.</p>
      )}

      <EditorField label="Add contributor" description="Search by name or profile key. A person without a profile needs one in Contributors first.">
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
    </AboutPaneSection>
  );
}
