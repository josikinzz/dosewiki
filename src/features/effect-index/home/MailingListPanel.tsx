"use client";

import { useId } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/common/Icon";
import { icons } from "@/utils/iconNames";
import {
  MailingListHoneypotField,
  useMailingListSignup,
} from "@/features/mailing-list/useMailingListSignup";
import { HomePanel } from "./HomePanel";

export function MailingListPanel() {
  const fieldId = useId();
  const { email, setEmail, website, setWebsite, status, error, submit } =
    useMailingListSignup("effectindex");

  return (
    <HomePanel
      title="Mailing List"
      description="Sign up for the Effect Index list"
      icon={icons.mail}
    >
      {status === "success" ? (
        <p
          className="theme-text-secondary flex items-center gap-2 text-[1.0625rem]"
          aria-live="polite"
        >
          <Icon icon="lucide:check" size={18} className="text-dose-accent shrink-0" />
          You&rsquo;re on the list.
        </p>
      ) : (
        <form onSubmit={submit}>
          <div className="flex gap-2">
            <label htmlFor={`${fieldId}-email`} className="sr-only">
              Email address
            </label>
            <input
              id={`${fieldId}-email`}
              type="email"
              required
              value={email}
              autoComplete="email"
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
              className="theme-text-primary min-w-0 flex-1 rounded-md border border-dose-border bg-transparent px-3 py-2 text-[1rem] placeholder:text-dose-text-ghost theme-field-focus"
            />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={status === "pending"}
              className="h-10 shrink-0 uppercase tracking-[0.1em]"
            >
              {status === "pending" ? "Subscribing…" : "Subscribe"}
            </Button>
          </div>
          <MailingListHoneypotField
            id={`${fieldId}-website`}
            value={website}
            onChange={setWebsite}
          />
          {status === "error" ? (
            <p className="mt-2 text-[0.9375rem] text-dose-danger" aria-live="polite">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </HomePanel>
  );
}
