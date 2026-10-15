"use client";
import { GlossaryFeedback } from "./GlossaryFeedback";
import { useState } from "react";
import {
  DefinitionList,
  DefinitionRow,
} from "@/components/common/DefinitionList";
import { Icon } from "@/components/common/Icon";
import { StateCard } from "@/components/common/StateCard";
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

export function LanguageGlossaryPage({
  language,
  entries,
  usages,
  credits = [],
  reference = false,
}: {
  reference?: boolean;
  language: (typeof glossaryLanguages)[number];
  entries: PublicGlossaryEntry[];
  usages: GlossaryUsageMap;
  readiness?: { state: string; href: string; glossaryHref: string };
  credits?: readonly PublicTranslationCredit[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<PublicGlossaryProvenance | "all">("all");
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
  const sections = reference
    ? [...GLOSSARY_CATEGORIES, OTHER_CATEGORY].map((item) => ({
        id: item.id,
        title: t(item.label),
        rows: visible.filter(
          (entry) => categoryForKind(entry.kind).id === item.id,
        ),
      }))
    : [
        {
          id: "needs-review",
          title: t("Needs a person"),
          rows: visible.filter(needsHumanReview),
        },
        {
          id: "checked",
          title: t("languageGlossary.status.human_review"),
          rows: visible.filter((entry) => !needsHumanReview(entry)),
        },
      ];
  return (
    <PublicContentShell focusTarget width="standard">
      <PageHeader
        title={t("Glossary")}
        mobileTitleLayout="wrap"
        description={
          reference
            ? t(
                "The fixed vocabulary of this site: what each term means here and, on a translated mirror, how it is rendered.",
              )
            : t(
                "Help translate dose.wiki. Click any term to suggest a translation. A person reviews every suggestion before anything changes.",
              )
        }
      />
      <p className="theme-text-secondary mb-6">
        {!reference ? (
          <>
            <bdi lang={language.code} dir={language.direction}>
              {language.nativeName}
            </bdi>
            {" · "}
          </>
        ) : null}
        <SmartLink className="underline" href="/glossary/languages">
          {t("All glossaries")}
        </SmartLink>
      </p>
      <ContributeCallout reference={reference} />
      <TranslationCredits
        className="mb-8"
        title={t("translationCredits.title")}
        credits={credits}
      />
      {!reference ? (
        <div className="mb-8 space-y-2">
          <p className="theme-text-primary font-semibold">
            {t("{{checked}} of {{total}} terms checked by a person", {
              checked,
              total: entries.length,
            })}
            {entries.length > checked
              ? ` · ${t("{{count}} need help", { count: entries.length - checked })}`
              : ""}
          </p>
          <div
            role="progressbar"
            aria-label={t("Terms checked by a person")}
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
      ) : null}
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="glossary-search">{t("Search terms")}</Label>
          <Input
            id="glossary-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="glossary-category">{t("Category")}</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger id="glossary-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("All categories")}</SelectItem>
              {[...GLOSSARY_CATEGORIES, OTHER_CATEGORY].map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {t(item.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!reference ? (
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
        ) : null}
      </div>
      <p role="status" className="theme-text-muted mb-6 text-sm">
        {visible.length
          ? t("{{count}} terms", { count: visible.length })
          : t("No terms match your search.")}
      </p>
      {!entries.length ? (
        <StateCard
          icon="lucide:book-open-text"
          tone="neutral"
          align="center"
          compact
          title={t("No glossary entries yet")}
          description={t(
            "Definitions are written in the editor and appear here once the first one is saved.",
          )}
        />
      ) : null}
      <div className="space-y-12">
        {sections.map((section) =>
          section.rows.length ? (
            <section key={section.id} id={section.id} className="space-y-6">
              <PublicSectionHeading title={section.title} />
              <DefinitionList className="divide-y divide-dose-border">
                {section.rows.map((entry) => (
                  <TermRow
                    key={entry.term}
                    entry={entry}
                    reference={reference}
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

function ContributeCallout({ reference }: { reference: boolean }) {
  const t = useT();
  return (
    <div
      data-glossary-contribute
      className="mb-8 flex items-start gap-3 rounded-card border border-dose-accent/35 bg-dose-accent/10 p-4 sm:p-5"
    >
      <Icon
        icon="lucide:languages"
        size={20}
        className="theme-icon-accent mt-0.5 shrink-0"
      />
      <div className="space-y-1">
        <p className="theme-text-primary font-semibold">
          {reference
            ? t("Help translate dose.wiki")
            : t("Help improve these translations")}
        </p>
        <p className="theme-text-secondary text-sm leading-6">
          {reference ? (
            <>
              {t(
                "This page is the English reference. Open a language glossary and tap the suggest button on any term to propose a translation. A person reviews every suggestion before anything changes.",
              )}{" "}
              <SmartLink className="underline" href="/glossary/languages">
                {t("All glossaries")}
              </SmartLink>
            </>
          ) : (
            t(
              "See a wording that could be better? Tap the suggest button on any term to propose a fix. A person reviews every suggestion before anything changes.",
            )
          )}
        </p>
      </div>
    </div>
  );
}

function TermRow({
  entry,
  reference,
  language,
  usages,
  open,
  onToggle,
}: {
  entry: PublicGlossaryEntry;
  reference: boolean;
  language: (typeof glossaryLanguages)[number];
  usages: GlossaryUsageMap;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const TermControl = reference ? "span" : "button";
  const panelId = `glossary-suggest-${encodeURIComponent(entry.term)}`;
  return (
    <DefinitionRow
      semantic
      term={
        <TermControl
          {...(!reference
            ? {
                type: "button" as const,
                "aria-expanded": open,
                "aria-controls": open ? panelId : undefined,
                onClick: onToggle,
              }
            : {})}
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
            {!reference ? (
              <ExpandIndicator isExpanded={open} className="mt-1 shrink-0" />
            ) : null}
          </span>
          {!reference ? (
            <span className="type-chip-label mt-0.5 inline-flex h-6 items-center gap-1.5 rounded-full border border-dose-accent/35 bg-dose-accent/10 px-2.5 text-dose-accent-strong transition-colors group-hover:border-dose-accent-strong group-hover:bg-dose-accent/20">
              <Icon
                icon="lucide:message-square-plus"
                size={12}
                className="shrink-0"
              />
              {entry.target
                ? t("languageGlossary.suggest.better")
                : t("Suggest a translation")}
            </span>
          ) : null}
        </TermControl>
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
        {!reference ? (
          <PublicPill
            size="sm"
            tone={entry.provenance === "human_review" ? "success" : "danger"}
          >
            {t(STATUS_MESSAGE[entry.provenance])}
          </PublicPill>
        ) : null}
        <PublicPill size="sm">
          {t(categoryForKind(entry.kind).label)}
        </PublicPill>
        <GlossaryUsageDisclosure
          term={entry.term}
          initialData={usages[entry.term]}
        />
      </div>
      {!reference && open && entry.version ? (
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
