"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

const MailingListInviteDialog = dynamic(() =>
  import("./MailingListInviteDialog").then((module) => module.MailingListInviteDialog),
);

/**
 * Lightweight homepage entry point. The form, dialog primitives, and submission
 * client are requested only after intent while this trigger remains immediately
 * available in the initial client graph.
 */
export function MailingListInvite({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const t = useT();

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="quiet"
        size="auto"
        className={cn(
          "-m-1.5 gap-2 p-1.5 text-[0.6875rem] uppercase leading-none tracking-[0.14em] [&_svg]:size-[26px]",
          className,
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="flex flex-col items-end gap-1">
          <span>{t("Mailing")}</span>
          <span>{t("List")}</span>
        </span>
        <Icon icon="f7:envelope-badge" size={26} />
      </Button>
      {open ? (
        <MailingListInviteDialog
          open={open}
          onOpenChange={setOpen}
          restoreFocus={() => triggerRef.current?.focus()}
        />
      ) : null}
    </>
  );
}
