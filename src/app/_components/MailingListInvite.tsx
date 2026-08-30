"use client";

import { useId } from "react";

import { Icon } from "@/components/common/Icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  MailingListHoneypotField,
  useMailingListSignup,
} from "@/features/mailing-list/useMailingListSignup";

/**
 * The homepage's mailing-list entry point: a free-floating text-and-icon lockup
 * pinned to the home viewport's bottom-right corner (its `className` carries the
 * positioning), set in the same tracked-uppercase register as `SiteSupporter`'s
 * "Supported by" label in the opposite corner. It opens a minimal signup dialog. The
 * dialog (Radix underneath `Dialog`) brings the focus trap, Escape/backdrop close,
 * and body scroll lock with it. Under `sm` the panel anchors near the top of the
 * viewport instead of centering, so the on-screen keyboard a focused email field
 * summons cannot cover the input or the submit button. It renders in both the live
 * and construction homepages: collecting interest is exactly what a holding page
 * is for.
 */
export function MailingListInvite({ className }: { className?: string }) {
  const fieldId = useId();
  const { email, setEmail, website, setWebsite, status, error, submit } =
    useMailingListSignup("dosewiki");

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="quiet"
          size="auto"
          className={cn(
            "-m-1.5 gap-2 p-1.5 text-[0.6875rem] uppercase leading-none tracking-[0.14em] [&_svg]:size-[26px]",
            className,
          )}
        >
          {/* Two stacked rows, right-aligned against the icon; the icon spans both
              rows. The invisible p-1.5/-m-1.5 pair widens the hit area without
              moving the visual corner inset. */}
          <span className="flex flex-col items-end gap-1">
            <span>Mailing</span>
            <span>List</span>
          </span>
          <Icon icon="f7:envelope-badge" size={26} />
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="top-16 w-[calc(100%-2rem)] max-w-sm translate-y-0 gap-3 rounded-2xl sm:top-[50%] sm:translate-y-[-50%]"
      >
        <DialogHeader>
          <DialogTitle className="theme-text-primary">Mailing list</DialogTitle>
        </DialogHeader>
        {status === "success" ? (
          <p className="theme-text-secondary flex items-center gap-2 text-sm" aria-live="polite">
            <Icon icon="lucide:check" size={16} className="text-dose-success shrink-0" />
            You&rsquo;re on the list.
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
