"use client";
import { GlossaryFeedback } from "./GlossaryFeedback";
import { useState } from "react";
import {
  DefinitionList,
  DefinitionRow,
} from "@/components/common/DefinitionList";
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
import {
  GLOSSARY_CATEGORIES,
  OTHER_CATEGORY,
  categoryForKind,
} from "@/lib/glossary/glossaryCategories";
import { useT } from "@/i18n/client";
import {
  PUBLIC_GLOSSARY_PROVENANCES,
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
  const t = useT();
  const query = search.trim().toLocaleLowerCase(language.code);
  const visible = entries.filter(
    (entry) =>
      (category === "all" || categoryForKind(entry.kind).id === category) &&
      (status === "all" || entry.provenance === status) &&
      `${entry.term}\n${entry.target ?? ""}`
        .toLocaleLowerCase(language.code)
        .includes(query),
  );
  return (
    <PublicContentShell focusTarget width="standard">
      <PageHeader
        title={`${language.name} glossary`}
        mobileTitleLayout="wrap"
        description="Explore the vocabulary, compare translations, and send feedback to reviewers."
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
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="glossary-search">
            Search English or translations
          </Label>
          <Input
            id="glossary-search"
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
        {[...GLOSSARY_CATEGORIES, OTHER_CATEGORY].map((group) => {
          const rows = visible.filter(
            (entry) => categoryForKind(entry.kind).id === group.id,
          );
          return rows.length ? (
            <section key={group.id} className="space-y-6">
              <PublicSectionHeading title={group.label} />
              <DefinitionList className="divide-y divide-dose-border">
                {rows.map((entry) => (
                  <DefinitionRow
                    key={entry.term}
                    semantic
                    term={
                      <>
                        <span
                          lang="en"
                          className="theme-text-primary font-semibold"
                        >
                          {entry.term}
                        </span>{" "}
                        <bdi
                          lang={language.code}
                          dir={language.direction}
                          className="theme-text-secondary"
                        >
                          {entry.target ?? "Translation missing"}
                        </bdi>
                      </>
                    }
                    termClassName="text-base leading-6"
                    bodyClassName="space-y-2"
                  >
                    {entry.gloss ? (
                      <p
                        lang="en"
                        className="theme-text-secondary text-sm leading-6"
                      >
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
                      <PublicPill size="sm">
                        {t(STATUS_MESSAGE[entry.provenance])}
                      </PublicPill>
                      <GlossaryUsageDisclosure term={entry.term} initialData={usages[entry.term]} />
                    </div>
                    {entry.version ? (
                      <GlossaryFeedback
                        key={entry.version}
                        locale={language.code}
                        entry={entry}
                      />
                    ) : null}
                  </DefinitionRow>
                ))}
              </DefinitionList>
            </section>
          ) : null;
        })}
      </div>
    </PublicContentShell>
  );
}
