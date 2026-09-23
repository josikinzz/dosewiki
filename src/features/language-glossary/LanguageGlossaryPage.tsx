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
import type {
  glossaryLanguages,
  PublicGlossaryEntry,
} from "./languageGlossary";
import type { GlossaryUsageMap } from "@/lib/glossary/glossaryUsage";

export function LanguageGlossaryPage({
  language,
  entries,
  usages,
  readiness,
}: {
  language: (typeof glossaryLanguages)[number];
  entries: PublicGlossaryEntry[];
  usages: GlossaryUsageMap;
  readiness: { state: string; href: string; glossaryHref: string };
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const query = search.trim().toLocaleLowerCase(language.code);
  const visible = entries.filter(
    (entry) =>
      (category === "all" || categoryForKind(entry.kind).id === category) &&
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
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
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
                    <div className="flex flex-wrap items-center gap-3">
                      <PublicPill size="sm">
                        {entry.status === "draft"
                          ? "Proposed"
                          : entry.status === "approved"
                            ? "Approved"
                            : "Missing"}
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
