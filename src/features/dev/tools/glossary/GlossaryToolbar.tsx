"use client";

import { useRef } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { glossaryExportUrl } from "./glossaryModel";

type GlossaryActionBarProps = {
  locale: string;
  locked: boolean;
  /** Drafting calls the model, so only admins see it; retranslation and the main run sit in the Runs panel in Articles. */
  canAdmin: boolean;
  onImport: (file: File | undefined) => void;
  onDraft: () => void;
};

/**
 * The occasional file and model actions, folded into one menu beside the
 * category heading so the terms stay the first thing a reviewer reads. What
 * a running write is doing shows in the Terms dock, outside the menu.
 */
export function GlossaryActionBar({
  locale,
  locked,
  canAdmin,
  onImport,
  onDraft,
}: GlossaryActionBarProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2" role="group" aria-label="Glossary actions">
      {/* Outside the menu, which unmounts its items on close. */}
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        aria-label="Choose a glossary CSV"
        className="sr-only"
        disabled={locked}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          onImport(file);
        }}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="-mr-2" aria-label="More">
            <Icon icon="lucide:ellipsis" size={14} />
            <span className="hidden sm:inline">More</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[14rem]">
          <DropdownMenuItem asChild>
            <a href={glossaryExportUrl(locale)} download={`glossary-${locale}.csv`}>
              <Icon icon="lucide:download" size={14} className="mr-2" />
              Export CSV
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={locked} onSelect={() => fileInput.current?.click()}>
            <Icon icon="lucide:upload" size={14} className="mr-2" />
            Import CSV
          </DropdownMenuItem>
          {canAdmin ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={locked} onSelect={onDraft}>
                <Icon icon="lucide:sparkles" size={14} className="mr-2" />
                Draft missing terms
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
