"use client";
import { GlossaryFeedback } from "./GlossaryFeedback";
import { useState } from "react";
import {
  DefinitionList,
  DefinitionRow,
} from "@/components/common/DefinitionList";
import { ExpandIndicator } from "@/components/common/ExpandButton";
import { PublicPill } from "@/components/common/PublicTokens";
import { SmartLink } from "@/components/common/SmartLink";
import { GlossaryUsageDisclosure } from "@/components/glossary/GlossaryUsageDisclosure";
import { PageHeader } from "@/components/layout/PageHeader";
import { TranslationCredits } from "./TranslationCredits";
import type { PublicTranslationCredit } from "@/data/content/translationCredits";
import {
  PublicContentShell,
  PublicSectionHeading,
} from "@/components/layout/PublicPagePrimitives";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { focusRingClassName } from "@/components/ui/surface";
import {
  GLOSSARY_CATEGORIES,
  OTHER_CATEGORY,
  categoryForKind,
} from "@/lib/glossary/glossaryCategories";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";
import {
  needsHumanReview,
  PUBLIC_GLOSSARY_PROVENANCES,
  sortByReviewPriority,
  type glossaryLanguages,
  type PublicGlossaryEntry,
  type PublicGlossaryProvenance,
} from "./languageGlossary";
import type { GlossaryUsageMap } from "@/lib/glossary/glossaryUsage";

const STATUS_MESSAGE: Record<PublicGlossaryProvenance, string> = {
  human_review: "languageGlossary.status.human_review",
  machine_suggestion: "languageGlossary.status.machine_suggestion",
  legacy_unverified: "languageGlossary.status.legacy_unverified",
  missing: "languageGlossary.status.missing",
};

/**
 * The public, contributable glossary for one language. Terms that still need
 * a person come first; clicking a term opens its suggestion box in place, and
 * every suggestion goes to the language's reviewers in the dev tools.
 */
export function LanguageGlossaryPage({
  language,
  entries,
  usages,
  readiness,
  credits = [],
}: {
  language: (typeof glossaryLanguages)[number];
  entries: PublicGlossaryEntry[];
  usages: GlossaryUsageMap;
  readiness: { state: string; href: string; glossaryHref: string };
  /** The people credited for this language; the block is omitted when empty. */
  credits?: readonly PublicTranslationCredit[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<PublicGlossaryProvenance | "all">(
    "all",
  );
  // One suggestion box at a time keeps the list readable and loads one captcha.
  const [openTerm, setOpenTerm] = useState<string | null>(null);
  const t = useT();
  const query = search.trim().toLocaleLowerCase(language.code);
  const visible = sortByReviewPriority(
    entries.filter(
      (entry) =>
        (category === "all" || categoryForKind(entry.kind).id === category) &&
        (status === "all" || entry.provenance === status) &&
        `${entry.term}\n${entry.target ?? ""}`
          .toLocaleLowerCase(language.code)
          .includes(query),
    ),
  );
  const checked = entries.filter((entry) => !needsHumanReview(entry)).length;
  const sections = [
    {
      id: "needs-review",
      title: "Needs a person",
      rows: visible.filter(needsHumanReview),
    },
    {
      id: "checked",
      title: "Checked by a person",
      rows: visible.filter((entry) => !needsHumanReview(entry)),
    },
  ];
  return (
    <PublicContentShell focusTarget width="standard">
      <PageHeader
        title={`${language.name} glossary`}
        mobileTitleLayout="wrap"
        description="Help translate dose.wiki. Click any term to suggest a translation. A person reviews every suggestion before anything changes."
      />
      <p className="theme-text-secondary mb-6">
        <bdi lang={language.code} dir={language.direction}>
          {language.nativeName}
        </bdi>{" "}
        · {readiness.state}
        {readiness.href !== readiness.glossaryHref ? (
          <>
            {" "}
            ·{" "}
            <a className="underline" href={readiness.href}>
              Visit website
            </a>
          </>
        ) : null}{" "}
        ·{" "}
        <SmartLink className="underline" href="/glossary/languages">
          All glossaries
        </SmartLink>
      </p>
      <TranslationCredits className="mb-8" title={t("translationCredits.title")} credits={credits} />
      <div className="mb-8 space-y-2">
        <p className="theme-text-primary font-semibold">
          {checked} of {entries.length} terms checked by a person
          {entries.length > checked
            ? ` · ${entries.length - checked} need help`
            : ""}
        </p>
        <div
          role="progressbar"
          aria-label="Terms checked by a person"
          aria-valuemin={0}
          aria-valuemax={entries.length}
          aria-valuenow={checked}
          className="bg-dose-border h-1.5 overflow-hidden rounded-full"
        >
          <div
            className="bg-dose-accent-strong h-full rounded-full"
            style={{
              width: `${entries.length ? (checked / entries.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="glossary-search">Search terms</Label>
          <Input
            id="glossary-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="glossary-category">Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="glossary-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {[...GLOSSARY_CATEGORIES, OTHER_CATEGORY].map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="glossary-status">
            {t("languageGlossary.status.filter")}
          </Label>
          <Select
            value={status}
            onValueChange={(value) =>
              setStatus(value as PublicGlossaryProvenance | "all")
            }
          >
            <SelectTrigger id="glossary-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t("languageGlossary.status.all")}
              </SelectItem>
              {PUBLIC_GLOSSARY_PROVENANCES.map((item) => (
                <SelectItem key={item} value={item}>
                  {t(STATUS_MESSAGE[item])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <p role="status" className="theme-text-muted mb-6 text-sm">
        {visible.length
          ? `${visible.length} terms`
          : "No terms match your search."}
      </p>
      <div className="space-y-12">
        {sections.map((section) =>
          section.rows.length ? (
            <section key={section.id} className="space-y-6">
              <PublicSectionHeading title={section.title} />
              <DefinitionList className="divide-y divide-dose-border">
                {section.rows.map((entry) => (
                  <TermRow
                    key={entry.term}
                    entry={entry}
                    language={language}
                    usages={usages}
                    open={openTerm === entry.term}
                    onToggle={() =>
                      setOpenTerm((current) =>
                        current === entry.term ? null : entry.term,
                      )
                    }
                  />
                ))}
              </DefinitionList>
            </section>
          ) : null,
        )}
      </div>
    </PublicContentShell>
  );
}

function TermRow({
  entry,
  language,
  usages,
  open,
  onToggle,
}: {
  entry: PublicGlossaryEntry;
  language: (typeof glossaryLanguages)[number];
  usages: GlossaryUsageMap;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const panelId = `glossary-suggest-${encodeURIComponent(entry.term)}`;
  return (
    <DefinitionRow
      semantic
      term={
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={onToggle}
          className={cn(
            "group -mx-2 flex w-[calc(100%+1rem)] flex-col items-start gap-0.5 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-dose-surface-muted/60",
            focusRingClassName,
          )}
        >
          <span className="flex w-full items-start justify-between gap-2">
            <span>
              <span lang="en" className="theme-text-primary font-semibold">
                {entry.term}
              </span>{" "}
              {entry.target ? (
                <bdi
                  lang={language.code}
                  dir={language.direction}
                  className="theme-text-secondary"
                >
                  {entry.target}
                </bdi>
              ) : null}
            </span>
            <ExpandIndicator isExpanded={open} className="mt-1 shrink-0" />
          </span>
          <span className="text-dose-accent-strong text-sm group-hover:underline">
            {entry.target
              ? "Suggest a better translation"
              : "Suggest a translation"}
          </span>
        </button>
      }
      termClassName="text-base leading-6"
      bodyClassName="space-y-2"
    >
      {entry.gloss ? (
        <p lang="en" className="theme-text-secondary text-sm leading-6">
          {entry.gloss}
        </p>
      ) : null}
      {entry.example ? (
        <figure className="border-dose-border space-y-1 border-l-2 pl-3 text-sm leading-6">
          <blockquote lang="en" className="theme-text-secondary">
            {entry.example.english}
          </blockquote>
          <blockquote
            lang={language.code}
            dir={language.direction}
            className="theme-text-secondary"
          >
            {entry.example.target}
          </blockquote>
          <figcaption>
            <SmartLink
              className="theme-text-muted underline"
              href={entry.example.href}
            >
              {t("languageGlossary.example.source")}
            </SmartLink>
          </figcaption>
        </figure>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <PublicPill size="sm">{t(STATUS_MESSAGE[entry.provenance])}</PublicPill>
        <PublicPill size="sm">{categoryForKind(entry.kind).label}</PublicPill>
        <GlossaryUsageDisclosure term={entry.term} initialData={usages[entry.term]} />
      </div>
      {open && entry.version ? (
        <div id={panelId}>
          <GlossaryFeedback
            key={entry.version}
            locale={language.code}
            entry={entry}
          />
        </div>
      ) : null}
    </DefinitionRow>
  );
}
