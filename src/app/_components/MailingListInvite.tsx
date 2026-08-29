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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MailingListHoneypotField,
  useMailingListSignup,
} from "@/features/mailing-list/useMailingListSignup";

/**
 * The homepage's mailing-list entry point: one quiet line under the quick-link tiles
 * that opens a minimal signup dialog. The line stays a footnote on purpose — the tiles
 * are what the page is for — and the dialog (Radix underneath `Dialog`) brings the
 * focus trap, Escape/backdrop close, and body scroll lock with it. It renders in both
 * the live and construction homepages: collecting interest is exactly what a holding
 * page is for.
 */
export function MailingListInvite({ className }: { className?: string }) {
  const fieldId = useId();
  const { email, setEmail, website, setWebsite, status, error, submit } =
    useMailingListSignup("dosewiki");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "theme-focus-ring rounded-md text-sm text-[var(--theme-text-muted)] underline decoration-[var(--theme-border-strong)] decoration-1 underline-offset-4 transition-colors hover:text-[var(--theme-text-primary)] hover:decoration-[var(--theme-accent-strong)]",
            className,
          )}
        >
          Want to join our mailing list?
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-sm gap-3 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="theme-text-primary">Join the mailing list</DialogTitle>
          <DialogDescription className="theme-text-secondary">
            Occasional dose.wiki news — new articles, launches, nothing noisy.
          </DialogDescription>
        </DialogHeader>
        {status === "success" ? (
          <p className="theme-text-secondary flex items-center gap-2 text-sm" aria-live="polite">
            <Icon icon="lucide:check" size={16} className="text-dose-success shrink-0" />
            You&rsquo;re on the list — thanks!
          </p>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={submit}>
            <label htmlFor={`${fieldId}-email`} className="sr-only">
              Email address
            </label>
            <Input
              id={`${fieldId}-email`}
              type="email"
              required
              value={email}
              autoComplete="email"
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
              {status === "pending" ? "Subscribing" : "Subscribe"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
