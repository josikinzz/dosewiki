"use client";

import { useId } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  MailingListHoneypotField,
  useMailingListSignup,
} from "@/features/mailing-list/useMailingListSignup";
import { useT } from "@/i18n/client";

interface MailingListInviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restoreFocus: () => void;
}

export function MailingListInviteDialog({
  open,
  onOpenChange,
  restoreFocus,
}: MailingListInviteDialogProps) {
  const fieldId = useId();
  const { email, setEmail, website, setWebsite, status, error, submit } =
    useMailingListSignup("dosewiki");
  const t = useT();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-16 w-[calc(100%-2rem)] max-w-sm translate-y-0 gap-3 rounded-2xl sm:top-[50%] sm:translate-y-[-50%]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle className="theme-text-primary">{t("Mailing list")}</DialogTitle>
          <DialogDescription className="theme-text-secondary text-sm">
            {t("An occasional note when something new lands on dose.wiki. Unsubscribe anytime.")}
          </DialogDescription>
        </DialogHeader>
        {status === "success" ? (
          <p
            className="theme-text-primary flex items-center gap-2 text-sm font-medium animate-in fade-in-0 zoom-in-95 duration-300 motion-reduce:animate-none"
            aria-live="polite"
          >
            <Icon icon="lucide:mail-check" size={16} className="text-dose-success shrink-0" />
            {t("You’re on the list.")}
          </p>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={submit}>
            <label htmlFor={`${fieldId}-email`} className="sr-only">
              {t("Email address")}
            </label>
            <Input
              id={`${fieldId}-email`}
              type="email"
              required
              value={email}
              autoComplete="email"
              name="email"
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
            <MailingListHoneypotField
              id={`${fieldId}-website`}
              value={website}
              onChange={setWebsite}
            />
            {status === "error" ? (
              <p className="text-sm text-dose-danger" aria-live="polite">
                {error}
              </p>
            ) : null}
            <Button type="submit" variant="accent" disabled={status === "pending"}>
              {status === "pending" ? (
                <Icon
                  icon="lucide:loader-circle"
                  size={16}
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : (
                <Icon icon="lucide:mail" size={16} />
              )}
              {status === "pending" ? t("Subscribing…") : t("Subscribe")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
