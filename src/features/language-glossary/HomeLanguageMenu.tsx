"use client";
import { SmartLink } from "@/components/common/SmartLink";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { LanguageDestination } from "./languageGlossary";
export function HomeLanguageMenu({
  languages,
}: {
  languages: readonly LanguageDestination[];
}) {
  return (
    <div className="theme-home-corner-widget fixed bottom-4 left-4 z-20 sm:bottom-6 sm:left-6">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="glass" className="min-h-11">
            Languages
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          className="max-h-[min(65vh,32rem)] max-w-[calc(100vw-2rem)] overflow-y-auto"
        >
          <DropdownMenuItem asChild>
            <a href="https://dose.wiki">English</a>
          </DropdownMenuItem>
          {languages.map((language) => (
            <DropdownMenuItem key={language.code} asChild>
              <a className="min-h-11" href={language.href}>
                <bdi lang={language.code} dir={language.direction}>
                  {language.nativeName}
                </bdi>
                <span>{language.name}</span>
                <span className="theme-text-muted text-xs">
                  {language.readiness === "Website available"
                    ? "Website"
                    : "Glossary"}
                </span>
              </a>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <SmartLink className="min-h-11" href="/glossary/languages">
              All glossaries
            </SmartLink>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
